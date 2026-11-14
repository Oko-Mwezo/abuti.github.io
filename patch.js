// Usage: node patch.js index.html dualtrack-hub.html
// Reads your current index.html and writes the full updated app (multi-item purchases + customer credit).
const fs = require('fs');
const src = process.argv[2] || 'index.html';
const out = process.argv[3] || 'dualtrack-hub.html';
let h = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');

function rep(find, repl) {
  const n = h.split(find).length - 1;
  if (n !== 1) { console.error('PATCH FAILED (' + n + ' matches) for: ' + find.slice(0, 80)); process.exit(1); }
  h = h.replace(find, function () { return repl; });
}
function repRe(re, repl) {
  const n = (h.match(new RegExp(re.source, 'g')) || []).length;
  if (n !== 1) { console.error('PATCH FAILED (' + n + ' matches) for: ' + re.source.slice(0, 80)); process.exit(1); }
  h = h.replace(re, function () { return repl; });
}

// ---------- HTML ----------
const CART_HTML = String.raw`<div class="flex flex-wrap items-center gap-2">
        <button type="button" onclick="addLineToCart()" class="px-4 py-2 text-xs font-bold uppercase tracking-wider border-2 border-black bg-white hover:bg-black hover:text-white transition flex items-center gap-1.5"><i class="ph-bold ph-plus-circle"></i> Add Item to This Purchase</button>
        <span class="text-[10px] font-mono text-zinc-500 uppercase">Tap for every item. For a single item, just record it.</span>
      </div>
      <div id="cart-box" class="hidden border-2 border-black bg-zinc-50 p-3"><div id="cart-list" class="space-y-1.5"></div></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label id="use-credit-wrap" class="hidden flex items-center gap-2 text-xs font-bold uppercase border-2 border-black p-2.5 bg-zinc-50">
          <input type="checkbox" id="use-credit" checked onchange="calculateSaleTotal()" class="accent-black"><span id="use-credit-text"></span>
        </label>
        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-black mb-1">Amount Received (R) - optional</label>
          <input type="number" id="amount-received" step="0.01" min="0" placeholder="Empty = exact amount" oninput="calculateSaleTotal()" class="w-full bg-white border-2 border-black px-3 py-2.5 text-xs text-black font-mono font-bold focus:outline-none focus:bg-zinc-50" />
        </div>
      </div>
      <div id="credit-note" class="text-[11px] font-mono font-bold uppercase text-black"></div>
      `;
rep('<!-- Bottom: Status & Total & Submit -->', CART_HTML + '<!-- Bottom: Status & Total & Submit -->');
rep('Add Customer Sale', 'Record Purchase');

// ---------- JS: state ----------
rep("let currentTopSort = 'qty';", "let currentTopSort = 'qty';\n    let cartLines = [];");

// ---------- JS: new functions (cart, credit, totals, submit, toggle, delete) ----------
const NEW_FUNCS = String.raw`function readLine() {
      const selectedItem = document.getElementById('cust-product').value;
      const qty = parseInt(document.getElementById('cust-qty').value, 10) || 0;
      const unitPrice = parseFloat(document.getElementById('cust-price').value);
      if (qty < 1) { showToast('Quantity must be at least 1'); return null; }
      if (!isFinite(unitPrice) || unitPrice < 0) { showToast('Enter a valid price'); return null; }
      let item = selectedItem, flavour = '', isCustom = false;
      if (selectedItem === 'Custom') {
        item = document.getElementById('cust-custom-name').value.trim();
        if (!item) { showToast('Enter a name for the custom item'); return null; }
        isCustom = true;
      } else if (selectedItem.toLowerCase() === FLAVOUR_ITEM_NAME.toLowerCase()) {
        flavour = document.getElementById('cust-flavour').value;
        if (!flavour || !flavours.some(function (f) { return f.available && f.name === flavour; })) {
          showToast('Pick an available flavour first'); return null;
        }
      }
      return { item: item, flavour: flavour, isCustom: isCustom, qty: qty, unitPrice: unitPrice, subtotal: round2(qty * unitPrice) };
    }

    function addLineToCart() {
      const l = readLine();
      if (!l) return;
      cartLines.push(l);
      document.getElementById('cust-qty').value = '1';
      document.getElementById('cust-custom-name').value = '';
      onProductSelectChange();
      renderCart();
    }

    function removeCartLine(i) { cartLines.splice(i, 1); renderCart(); }

    function renderCart() {
      document.getElementById('cart-box').classList.toggle('hidden', cartLines.length === 0);
      document.getElementById('cart-list').innerHTML = cartLines.map(function (l, i) {
        return '<div class="flex items-center justify-between gap-2 text-xs border border-black bg-white px-2.5 py-1.5">' +
          '<span class="font-bold uppercase">' + escapeHtml(itemLabel(l)) + ' <span class="font-mono text-zinc-500">x' + l.qty + ' @ ' + formatRand(l.unitPrice) + '</span></span>' +
          '<span class="flex items-center gap-2"><b class="font-mono">' + formatRand(l.subtotal) + '</b>' +
          '<button type="button" onclick="removeCartLine(' + i + ')" class="border border-black p-0.5 hover:bg-black hover:text-white"><i class="ph-bold ph-x"></i></button></span></div>';
      }).join('');
      calculateSaleTotal();
    }

    function addCustomerCredit(no) {
      const c = customers.find(function (x) { return x.no === no; });
      if (!c) return;
      const v = prompt('Credit for ' + c.name + ' (now ' + formatRand(c.credit || 0) + ').\nAmount to ADD (negative number removes credit):', '');
      if (v === null) return;
      const amt = round2(parseFloat(v));
      if (!isFinite(amt) || amt === 0) { showToast('Enter a valid amount'); return; }
      c.credit = round2(Math.max(0, (c.credit || 0) + amt));
      saveCustomers();
      renderLoyaltySummary();
      calculateSaleTotal();
      showToast(c.name.toUpperCase() + ' CREDIT: ' + formatRand(c.credit));
    }

    function calculateSaleTotal() {
      const qty = parseInt(document.getElementById('cust-qty').value, 10) || 0;
      const unitPrice = parseFloat(document.getElementById('cust-price').value) || 0;
      const lineSub = round2(Math.max(0, qty) * Math.max(0, unitPrice));
      const subtotal = cartLines.length ? round2(cartLines.reduce(function (a, l) { return a + l.subtotal; }, 0)) : lineSub;

      const loyalty = getCustomerPurchaseHistory(document.getElementById('cust-name').value.trim());
      const discountTag = document.getElementById('cust-discount-tag');
      const originalSubtotalEl = document.getElementById('cust-original-subtotal');

      let finalTotal = subtotal, discountAmount = 0;
      if (loyalty.isFourthOrder && subtotal > 0) {
        discountAmount = round2(subtotal * LOYALTY_PERCENT / 100);
        finalTotal = round2(subtotal - discountAmount);
        discountTag.classList.remove('hidden');
        originalSubtotalEl.classList.remove('hidden');
        originalSubtotalEl.innerText = formatRand(subtotal);
      } else {
        discountTag.classList.add('hidden');
        originalSubtotalEl.classList.add('hidden');
      }
      document.getElementById('cust-order-total').innerText = formatRand(finalTotal);

      const avail = loyalty.customer ? round2(loyalty.customer.credit || 0) : 0;
      document.getElementById('use-credit-wrap').classList.toggle('hidden', avail <= 0);
      document.getElementById('use-credit-text').innerText = 'Use credit (' + formatRand(avail) + ')';
      const creditUsed = (avail > 0 && document.getElementById('use-credit').checked) ? Math.min(avail, finalTotal) : 0;
      const due = round2(finalTotal - creditUsed);
      const recvRaw = document.getElementById('amount-received').value;
      const received = recvRaw === '' ? null : round2(parseFloat(recvRaw) || 0);
      const extra = (received !== null && received > due) ? round2(received - due) : 0;

      let note = '';
      if (creditUsed > 0) note += 'Credit -' + formatRand(creditUsed) + ' | Pay ' + formatRand(due) + ' ';
      if (extra > 0) note += '+' + formatRand(extra) + ' to credit ';
      document.getElementById('credit-note').innerText = note ? note + '(if Paid)' : '';

      return {
        subtotal: subtotal, discountAmount: discountAmount,
        discountPercent: (loyalty.isFourthOrder && subtotal > 0) ? LOYALTY_PERCENT : 0,
        finalTotal: finalTotal, orderSequence: loyalty.nextOrderNumber,
        creditUsed: creditUsed, due: due, received: received, extra: extra
      };
    }

    function handleSaleSubmit(e) {
      e.preventDefault();
      const typedName = document.getElementById('cust-name').value.trim();
      const block = document.getElementById('cust-block').value.trim();
      if (!typedName || !block) { showToast('Provide Customer Name and Block'); return; }

      let cust = findCustomer(typedName);
      if (!cust && isCustomerNoFormat(typedName)) {
        showToast('Customer ' + typedName.toUpperCase() + ' not found. Type a name for a new customer'); return;
      }
      const customerName = cust ? cust.name : typedName;

      let lines = cartLines.slice();
      if (!lines.length) { const l = readLine(); if (!l) return; lines = [l]; }

      const calc = calculateSaleTotal();
      if (calc.finalTotal <= 0) { showToast('Order total must be > R0'); return; }

      const statusEl = document.querySelector('input[name="pay-status"]:checked');
      const status = statusEl ? statusEl.value : 'Paid';
      const paid = status === 'Paid';
      const creditUsed = paid ? calc.creditUsed : 0;
      const due = round2(calc.finalTotal - creditUsed);
      if (paid && calc.received !== null && calc.received < due - 0.005) {
        showToast('Received is less than ' + formatRand(due) + '. Enter the full amount or choose Owing'); return;
      }
      const extra = paid ? calc.extra : 0;

      const need = {};
      lines.forEach(function (l) { if (!l.isCustom) { const k = l.item.toLowerCase(); need[k] = (need[k] || 0) + l.qty; } });
      for (const k in need) {
        const si = inventoryItems.find(function (i) { return i.name.toLowerCase() === k; });
        if (si && si.stock < need[k] && !confirm('Warning: Only ' + si.stock + ' ' + si.name + ' left (selling ' + need[k] + '). Continue?')) return;
      }

      let isNewCustomer = false;
      if (!cust) { cust = registerCustomer(customerName, block); isNewCustomer = true; } else { cust.block = block; }
      cust.credit = round2(Math.max(0, (cust.credit || 0) - creditUsed + extra));
      saveCustomers();

      const receiptNo = nextReceiptNo();
      saveReceiptCounter();
      const pct = calc.discountPercent;
      const date = localDateStr();

      const created = lines.map(function (l, i) {
        return {
          id: newId('biz'), customer: customerName, customerNo: cust.no, receiptNo: receiptNo, block: block,
          item: l.item, flavour: l.flavour, isCustom: l.isCustom, qty: l.qty, unitPrice: l.unitPrice,
          subtotal: l.subtotal, discountPercent: pct, total: round2(l.subtotal * (100 - pct) / 100),
          orderSequence: calc.orderSequence, stockDeducted: l.isCustom ? 0 : deductStockForSale(l.item, l.qty),
          status: status, date: date,
          creditUsed: i === 0 ? creditUsed : 0, creditAdded: i === 0 ? extra : 0
        };
      });
      businessSales.unshift.apply(businessSales, created);
      saveBusinessData();

      cartLines = [];
      ['cust-name', 'cust-block', 'cust-custom-name', 'amount-received'].forEach(function (id) { document.getElementById(id).value = ''; });
      document.getElementById('cust-qty').value = '1';
      document.getElementById('use-credit').checked = true;
      document.getElementById('cust-autocomplete-list').classList.add('hidden');
      document.getElementById('cust-order-count-hint').innerText = '';
      document.getElementById('loyalty-indicator-badge').classList.add('hidden');

      renderCart();
      renderBusinessSection();
      onProductSelectChange();

      const label = customerName.toUpperCase() + ' (' + cust.no + ') P' + calc.orderSequence + ': ' + lines.length + ' ITEM' + (lines.length > 1 ? 'S' : '');
      let msg = (pct > 0 ? '4TH ORDER ' + pct + '% OFF! ' : isNewCustomer ? 'NEW CUSTOMER. ' : '') + label + ' ' + formatRand(calc.finalTotal);
      if (extra > 0) msg += ' | +' + formatRand(extra) + ' CREDIT';
      showToast(msg, { label: 'RECEIPT', duration: 8000, onClick: function () { openSaleReceipt(created[0].id); } });
    }

    function toggleSaleStatus(id) {
      const sale = businessSales.find(function (s) { return s.id === id; });
      if (!sale) return;
      const next = sale.status === 'Paid' ? 'Owing' : 'Paid';
      businessSales.forEach(function (s) { if (s.receiptNo === sale.receiptNo) s.status = next; });
      saveBusinessData();
      renderBusinessSection();
      showToast(sale.customer.toUpperCase() + ' ' + (sale.receiptNo || '') + ': ' + next.toUpperCase());
    }

    function deleteSaleEntry(id) {
      const sale = businessSales.find(function (s) { return s.id === id; });
      if (!sale) return;
      const group = businessSales.filter(function (s) { return s.receiptNo === sale.receiptNo; });
      if (group.length > 1 && !confirm('This purchase has ' + group.length + ' items. Delete the whole purchase?')) return;
      let restored = 0, creditDelta = 0;
      group.forEach(function (r) {
        creditDelta += (r.creditUsed || 0) - (r.creditAdded || 0);
        if (r.isCustom) return;
        const si = inventoryItems.find(function (i) { return i.name.toLowerCase() === String(r.item || '').toLowerCase(); });
        if (si) {
          const n = typeof r.stockDeducted === 'number' ? r.stockDeducted : (parseInt(r.qty, 10) || 0);
          si.stock += n; restored += n;
        }
      });
      saveInventoryData();
      businessSales = businessSales.filter(function (s) { return s.receiptNo !== sale.receiptNo; });
      if (creditDelta !== 0) {
        const c = customers.find(function (x) { return x.no === sale.customerNo; });
        if (c) { c.credit = round2(Math.max(0, (c.credit || 0) + creditDelta)); saveCustomers(); }
      }
      saveBusinessData();
      renderBusinessSection();
      onCustomerNameInput();
      showToast('DELETED PURCHASE: ' + sale.customer.toUpperCase() + (restored > 0 ? ' (STOCK +' + restored + ')' : ''));
    }

    `;
// Rename the old versions FIRST, then insert the new ones (otherwise the names match twice)
rep('function handleSaleSubmit(e) {', 'function _oldHandleSaleSubmit(e) {');
rep('function toggleSaleStatus(id) {', 'function _oldToggleSaleStatus(id) {');
rep('function deleteSaleEntry(id) {', 'function _oldDeleteSaleEntry(id) {');
rep('function calculateSaleTotal() {', NEW_FUNCS + 'function _oldCalculateSaleTotal() {');

// ---------- JS: purchase counting + loyalty list ----------
rep('const orderCount = mine.length;',
  "const orderCount = new Set(mine.map(function (s) { return s.receiptNo || s.id; })).size;");
rep('discountsEarned: 0,', 'discountsEarned: 0, disc: {}, receipts: {}, credit: reg ? (reg.credit || 0) : 0,');
rep('customerMap[no].ordersCount += 1;',
  "customerMap[no].receipts[s.receiptNo || s.id] = 1;\n        customerMap[no].ordersCount = Object.keys(customerMap[no].receipts).length;");
rep('if (s.discountPercent > 0) customerMap[no].discountsEarned += 1;',
  'if (s.discountPercent > 0) customerMap[no].disc[s.receiptNo || s.id] = 1;');
rep('if (customerArray.length === 0) {',
  "customerArray.forEach(function (c) { c.discountsEarned = Object.keys(c.disc).length; });\n\n      if (customerArray.length === 0) {");
rep(String.raw`'<button onclick="openCustomerStatement(\''`,
  String.raw`(c.credit > 0 ? '<div class="text-[10px] font-mono font-bold text-black mt-1.5 border border-black inline-block px-1 bg-white">CREDIT ' + formatRand(round2(c.credit)) + '</div>' : '') +
            '<button onclick="addCustomerCredit(\'' + escapeHtml(c.no) + '\')" class="mt-2 w-full py-1 text-[10px] font-mono font-bold uppercase border border-black bg-white hover:bg-black hover:text-white transition flex items-center justify-center gap-1"><i class="ph-bold ph-coins"></i> Add / Remove Credit</button>' +
            ` + String.raw`'<button onclick="openCustomerStatement(\''`);

// ---------- Receipts ----------
rep('dueAll: round2(dueAll)', 'dueAll: round2(dueAll),\n        creditBalance: cust ? round2(cust.credit || 0) : 0');

rep("if (r.type === 'single') {", String.raw`if (r.type === 'single') {
        const s0 = businessSales.find(function (x) { return x.id === r.saleId; });
        if (!s0) return null;
        const lines = custSales.filter(function (x) { return x.receiptNo === s0.receiptNo; });
        const subtotal = round2(lines.reduce(function (a, x) { return a + (parseFloat(x.subtotal) || ((parseFloat(x.qty) || 0) * (parseFloat(x.unitPrice) || 0))); }, 0));
        const total = round2(lines.reduce(function (a, x) { return a + (parseFloat(x.total) || 0); }, 0));
        return Object.assign(base, {
          purchaseNo: parseInt(s0.orderSequence, 10) || (custSales.length - custSales.indexOf(s0)),
          docNo: s0.receiptNo || '-', date: s0.date || localDateStr(),
          customerName: s0.customer, block: s0.block, lines: lines, sale: lines[0],
          subtotal: subtotal, discount: round2(Math.max(0, subtotal - total)),
          discountPercent: s0.discountPercent || 0, total: total,
          status: lines.every(function (x) { return x.status === 'Paid'; }) ? 'Paid' : 'Owing',
          creditUsed: lines[0].creditUsed || 0, creditAdded: lines[0].creditAdded || 0
        });
      }
      if (false) {`);

// On-screen slip: item lines
repRe(/\/\/ Item\n[\s\S]*?\/\/ Totals/, String.raw`// Items
        d.lines.forEach(function (x) {
          h += '<div class="flex justify-between gap-3 text-xs mb-2"><div><div class="font-bold uppercase">' + escapeHtml(itemLabel(x)) + '</div>' +
               '<div class="text-[10px] text-zinc-600">' + x.qty + ' x ' + formatRand(x.unitPrice) + '</div></div>' +
               '<div class="font-black">' + formatRand(x.subtotal || (x.qty * x.unitPrice)) + '</div></div>';
        });
        h += rule;

        // Totals`);
rep(`h += row('<b class="text-sm">TOTAL</b>', '<b class="text-sm">' + formatRand(d.total) + '</b>');`,
  `h += row('<b class="text-sm">TOTAL</b>', '<b class="text-sm">' + formatRand(d.total) + '</b>');
        if (d.creditUsed > 0) h += row('Paid with credit', formatRand(d.creditUsed));
        if (d.creditAdded > 0) h += row('Extra paid (to credit)', formatRand(d.creditAdded));
        if (d.creditBalance > 0) h += row('<b>CREDIT BALANCE</b>', '<b>' + formatRand(d.creditBalance) + '</b>');`);

// WhatsApp / copy text
rep(`L.push(s.qty + ' x ' + itemLabel(s) + ' @ ' + formatRand(s.unitPrice) + ' = ' + formatRand(d.subtotal));`,
  `d.lines.forEach(function (x) { L.push(x.qty + ' x ' + itemLabel(x) + ' @ ' + formatRand(x.unitPrice) + ' = ' + formatRand(x.subtotal || (x.qty * x.unitPrice))); });`);
rep(`L.push('*TOTAL: ' + formatRand(d.total) + '*');`,
  `L.push('*TOTAL: ' + formatRand(d.total) + '*');
        if (d.creditUsed > 0) L.push('Paid with credit: ' + formatRand(d.creditUsed));
        if (d.creditAdded > 0) L.push('Extra paid (added to credit): ' + formatRand(d.creditAdded));
        if (d.creditBalance > 0) L.push('*Credit balance: ' + formatRand(d.creditBalance) + '*');`);

// PDF slip
repRe(/const s = d\.sale;\n\s*doc\.setFont\('helvetica', 'bold'\);[\s\S]*?y \+= 3;\n\s*rule\(\);/, String.raw`d.lines.forEach(function (s) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
          const itemLines = doc.splitTextToSize(pdfSafe(itemLabel(s)), 44);
          doc.text(itemLines, M, y);
          doc.text(formatRand(s.subtotal || (s.qty * s.unitPrice)), R, y, { align: 'right' });
          y += itemLines.length * 3.7;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
          doc.text(s.qty + ' x ' + formatRand(s.unitPrice), M, y);
          y += 4.5;
        });
        rule();`);
rep(`row('TOTAL', formatRand(d.total), true, 11);`,
  `row('TOTAL', formatRand(d.total), true, 11);
        if (d.creditUsed > 0) row('Paid with credit', formatRand(d.creditUsed));
        if (d.creditAdded > 0) row('Extra (to credit)', formatRand(d.creditAdded));
        if (d.creditBalance > 0) row('CREDIT BALANCE', formatRand(d.creditBalance), true);`);

// ---------- Rename to Abuti Wa Charcoal (display text only; saved-data keys stay the same) ----------
h = h.split('DualTrack Hub').join('Abuti Wa Charcoal');
rep('<title>Finance &amp; Hubbly Reseller Tracker</title>', '<title>Abuti Wa Charcoal</title>');
rep("businessName: 'Hubbly Reseller',", "businessName: 'Abuti Wa Charcoal',");

// ---------- Syntax check, then write ----------
try {
  const js = h.slice(h.lastIndexOf('<script>') + 8, h.lastIndexOf('</script>'));
  new Function(js);
} catch (err) {
  console.error('Patched script has a syntax error: ' + err.message);
  process.exit(1);
}
fs.writeFileSync(out, h);
console.log('Done. Wrote ' + out + ' - keep it next to server.js and restart: node server.js');