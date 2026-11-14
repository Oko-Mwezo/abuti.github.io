// Usage: node fix-credit.js index.html
// Run it on the file that ALREADY has the credit feature. It makes a .bak copy first.
// Replaces the browser pop-up (which browsers can block) with a built-in popup.
const fs = require('fs');
const file = process.argv[2] || 'index.html';
let h = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function rep(find, repl) {
  const n = h.split(find).length - 1;
  if (n !== 1) { console.error('FIX FAILED (' + n + ' matches) for: ' + find.slice(0, 80)); process.exit(1); }
  h = h.replace(find, function () { return repl; });
}

const MODAL = String.raw`<!-- Credit Modal -->
  <div id="credit-modal" class="fixed inset-0 bg-black/60 z-50 hidden flex items-center justify-center p-4" onclick="if (event.target === this) closeCreditModal()">
    <div class="bg-white border-2 border-black p-6 w-full max-w-sm shadow-[6px_6px_0px_0px_#000]">
      <div class="flex items-center justify-between pb-3 border-b-2 border-black mb-4">
        <h4 class="font-black text-sm uppercase tracking-wider text-black flex items-center gap-2"><i class="ph-bold ph-coins text-base"></i> Customer Credit</h4>
        <button type="button" onclick="closeCreditModal()" class="text-black hover:bg-black hover:text-white border border-black p-1 transition"><i class="ph-bold ph-x"></i></button>
      </div>
      <div id="credit-modal-info" class="text-xs font-bold uppercase mb-3"></div>
      <label class="block text-xs font-bold uppercase tracking-wider text-black mb-1">Amount (R)</label>
      <input type="number" id="credit-modal-amount" step="0.01" min="0.01" placeholder="0.00" class="w-full bg-white border-2 border-black px-3 py-2.5 text-[16px] sm:text-xs text-black font-mono font-bold focus:outline-none focus:bg-zinc-50" />
      <div class="grid grid-cols-2 gap-2 mt-4">
        <button type="button" onclick="applyCredit(1)" class="py-2.5 uppercase text-xs font-bold border-2 border-black bg-black text-white hover:bg-zinc-800 transition">+ Add</button>
        <button type="button" onclick="applyCredit(-1)" class="py-2.5 uppercase text-xs font-bold border-2 border-black bg-white text-black hover:bg-black hover:text-white transition">- Remove</button>
      </div>
    </div>
  </div>

  `;
rep('<!-- Receipt Modal Dialog -->', MODAL + '<!-- Receipt Modal Dialog -->');

const FUNCS = String.raw`let creditModalNo = null;

    function addCustomerCredit(no) {
      const c = customers.find(function (x) { return x.no === no; });
      if (!c) { showToast('Customer not found'); return; }
      creditModalNo = no;
      document.getElementById('credit-modal-info').innerText = c.name + ' (' + c.no + ') - credit now ' + formatRand(c.credit || 0);
      document.getElementById('credit-modal-amount').value = '';
      document.getElementById('credit-modal').classList.remove('hidden');
      setTimeout(function () { document.getElementById('credit-modal-amount').focus(); }, 50);
    }

    function closeCreditModal() {
      document.getElementById('credit-modal').classList.add('hidden');
      creditModalNo = null;
    }

    function applyCredit(sign) {
      const c = customers.find(function (x) { return x.no === creditModalNo; });
      if (!c) { closeCreditModal(); return; }
      const amt = round2(parseFloat(document.getElementById('credit-modal-amount').value));
      if (!isFinite(amt) || amt <= 0) { showToast('Enter an amount above R0'); return; }
      if (sign < 0 && amt > (c.credit || 0)) { showToast('Cannot remove more than ' + formatRand(c.credit || 0)); return; }
      c.credit = round2(Math.max(0, (c.credit || 0) + sign * amt));
      saveCustomers();
      renderLoyaltySummary();
      calculateSaleTotal();
      closeCreditModal();
      showToast(c.name.toUpperCase() + ' CREDIT: ' + formatRand(c.credit));
    }

    `;
rep('function addCustomerCredit(no) {', FUNCS + 'function _oldAddCustomerCredit(no) {');

try {
  new Function(h.slice(h.lastIndexOf('<script>') + 8, h.lastIndexOf('</script>')));
} catch (err) {
  console.error('Syntax error after fix: ' + err.message);
  process.exit(1);
}
fs.writeFileSync(file + '.bak', fs.readFileSync(file));
fs.writeFileSync(file, h);
console.log('Done. Fixed ' + file + ' (backup: ' + file + '.bak)');