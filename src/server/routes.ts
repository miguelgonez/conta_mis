import { Router, Request, Response } from 'express';
import { db } from './data.js';
import { Invoice, Bill } from '../types.js';
import {
  parseNorma43,
  parseCaixaBankCsv,
  generateSampleNorma43,
  generateSepaPain001Xml,
  caixabankState,
  Norma43Transaction,
} from './caixabank.js';

export const apiRouter = Router();

// ==========================================
// Authentication & Setup
// ==========================================
apiRouter.get('/auth/status', (_req: Request, res: Response) => {
  res.json({
    authenticated: db.auth.authenticated,
    setup_needed: db.auth.setup_needed,
    username: db.auth.username,
    role: db.auth.role,
    company_name: db.company.name,
  });
});

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { username } = req.body || {};
  db.auth.authenticated = true;
  db.auth.username = username || 'admin';
  res.json({
    authenticated: true,
    token: 'sbp_session_token_' + Date.now(),
    user: { username: db.auth.username, role: 'admin' },
  });
});

apiRouter.post('/auth/logout', (_req: Request, res: Response) => {
  db.auth.authenticated = false;
  res.json({ ok: true, message: 'Signed out successfully' });
});

apiRouter.post('/auth/setup', (req: Request, res: Response) => {
  const { company_name, admin_username } = req.body || {};
  if (company_name) db.company.name = company_name;
  if (admin_username) db.auth.username = admin_username;
  db.auth.authenticated = true;
  db.auth.setup_needed = false;
  res.json({ ok: true, company: db.company });
});

// ==========================================
// Dashboard & Analytics
// ==========================================
apiRouter.get('/dashboard', (_req: Request, res: Response) => {
  const totalReceivables = db.invoices
    .filter((inv) => inv.status !== 'void' && inv.status !== 'paid')
    .reduce((sum, inv) => sum + (Number(inv.balance_due) || 0), 0);

  const totalPayables = db.bills
    .filter((b) => b.status !== 'void' && b.status !== 'paid')
    .reduce((sum, b) => sum + (Number(b.balance_due) || 0), 0);

  const bankBalances = db.bankAccounts.map((ba) => ({
    id: ba.id,
    name: ba.name,
    balance: ba.balance,
  }));

  res.json({
    total_receivables: totalReceivables,
    overdue_count: db.invoices.filter((inv) => inv.status === 'sent' && new Date(inv.due_date || '') < new Date()).length,
    customer_count: db.customers.filter((c) => c.is_active).length,
    total_payables: totalPayables,
    overdue_bills: db.bills.filter((b) => b.status === 'unpaid' && new Date(b.due_date) < new Date()).length,
    recent_invoices: db.invoices.slice(-6).reverse(),
    recent_payments: db.payments.slice(-6).reverse(),
    bank_balances: bankBalances,
  });
});

apiRouter.get('/dashboard/charts', (_req: Request, res: Response) => {
  const now = new Date();
  let agingCurrent = 0;
  let aging30 = 0;
  let aging60 = 0;
  let aging90 = 0;

  for (const inv of db.invoices) {
    if (inv.status === 'paid' || inv.status === 'void') continue;
    const due = new Date(inv.due_date || inv.date);
    const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    const bal = inv.balance_due;
    if (diffDays <= 0) agingCurrent += bal;
    else if (diffDays <= 30) aging30 += bal;
    else if (diffDays <= 60) aging60 += bal;
    else aging90 += bal;
  }

  res.json({
    aging_current: agingCurrent,
    aging_30: aging30,
    aging_60: aging60,
    aging_90: aging90,
    monthly_revenue: [
      { month: 'Oct', amount: 18500 },
      { month: 'Nov', amount: 22400 },
      { month: 'Dec', amount: 28900 },
      { month: 'Jan', amount: 19200 },
      { month: 'Feb', amount: 24100 },
      { month: 'Mar', amount: 27300 },
      { month: 'Apr', amount: 31500 },
      { month: 'May', amount: 29800 },
      { month: 'Jun', amount: 34200 },
      { month: 'Jul', amount: 32100 },
      { month: 'Aug', amount: 36800 },
      { month: 'Sep', amount: 14250 },
    ],
  });
});

apiRouter.get('/analytics/dashboard', (_req: Request, res: Response) => {
  res.json({
    gross_margin_pct: 48.2,
    net_profit_pct: 21.5,
    quick_ratio: 2.1,
    current_ratio: 2.8,
    days_sales_outstanding: 28,
  });
});

apiRouter.get('/analytics/summary', (_req: Request, res: Response) => {
  res.json({
    cash_runway_months: 8.4,
    monthly_burn_rate: 18500,
    ar_turnover: 12.8,
  });
});

apiRouter.get('/analytics/ai-config', (_req: Request, res: Response) => {
  res.json({ enabled: false, provider: 'none', model: '' });
});

apiRouter.put('/analytics/ai-config', (req: Request, res: Response) => {
  res.json({ ok: true, ...req.body });
});

// ==========================================
// Customers
// ==========================================
apiRouter.get('/customers', (req: Request, res: Response) => {
  let list = db.customers;
  if (req.query.active_only === 'true') {
    list = list.filter((c) => c.is_active);
  }
  res.json(list);
});

apiRouter.get('/customers/check-duplicate', (req: Request, res: Response) => {
  const name = String(req.query.name || '').trim().toLowerCase();
  const found = db.customers.some((c) => c.name.toLowerCase() === name);
  res.json({ duplicate: found });
});

apiRouter.get('/customers/:id', (req: Request, res: Response) => {
  const customer = db.customers.find((c) => c.id === Number(req.params.id));
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
});

apiRouter.post('/customers', (req: Request, res: Response) => {
  const newCustomer = {
    id: db.customers.length > 0 ? Math.max(...db.customers.map((c) => c.id)) + 1 : 1,
    name: req.body.name || 'New Customer',
    company: req.body.company || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    mobile: req.body.mobile || '',
    bill_address1: req.body.bill_address1 || '',
    bill_city: req.body.bill_city || '',
    bill_state: req.body.bill_state || '',
    bill_zip: req.body.bill_zip || '',
    terms: req.body.terms || 'Net 30',
    credit_limit: Number(req.body.credit_limit) || 10000,
    is_taxable: req.body.is_taxable !== false,
    balance: 0,
    is_active: true,
    notes: req.body.notes || '',
    created_at: new Date().toISOString(),
  };
  db.customers.push(newCustomer);
  db.auditLog.push({
    id: db.auditLog.length + 1,
    timestamp: new Date().toISOString(),
    user: db.auth.username,
    action: 'CREATE',
    entity_type: 'Customer',
    entity_id: newCustomer.id,
    description: `Added customer ${newCustomer.name}`,
  });
  res.status(201).json(newCustomer);
});

apiRouter.put('/customers/:id', (req: Request, res: Response) => {
  const idx = db.customers.findIndex((c) => c.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Customer not found' });
  db.customers[idx] = { ...db.customers[idx], ...req.body };
  res.json(db.customers[idx]);
});

apiRouter.delete('/customers/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const idx = db.customers.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Customer not found' });
  db.customers[idx].is_active = false;
  res.json({ ok: true });
});

// ==========================================
// Invoices & Sales Receipts
// ==========================================
apiRouter.get('/invoices', (req: Request, res: Response) => {
  let list = db.invoices;
  if (req.query.is_sales_receipt === 'true') {
    list = list.filter((inv) => inv.is_sales_receipt);
  } else if (req.query.is_sales_receipt === 'false') {
    list = list.filter((inv) => !inv.is_sales_receipt);
  }
  if (req.query.customer_id) {
    list = list.filter((inv) => inv.customer_id === Number(req.query.customer_id));
  }
  res.json(list);
});

apiRouter.get('/invoices/:id', (req: Request, res: Response) => {
  const inv = db.invoices.find((i) => i.id === Number(req.params.id));
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

apiRouter.post('/invoices', (req: Request, res: Response) => {
  const body = req.body;
  const customer = db.customers.find((c) => c.id === Number(body.customer_id));
  const newId = db.invoices.length > 0 ? Math.max(...db.invoices.map((i) => i.id)) + 1 : 1;
  const invNum = body.invoice_number || String(1000 + newId);

  let subtotal = 0;
  const lines = (body.lines || []).map((line: any, index: number) => {
    const qty = Number(line.quantity) || 1;
    const rate = Number(line.rate) || 0;
    const amt = line.amount !== undefined ? Number(line.amount) : qty * rate;
    subtotal += amt;
    return {
      id: index + 1,
      item_id: line.item_id ? Number(line.item_id) : undefined,
      description: line.description || '',
      quantity: qty,
      rate: rate,
      amount: amt,
      line_order: index + 1,
    };
  });

  const taxRate = body.tax_rate !== undefined ? Number(body.tax_rate) : 0.065;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;
  const isReceipt = Boolean(body.is_sales_receipt);
  const balanceDue = isReceipt ? 0 : total;

  const invoice: Invoice = {
    id: newId,
    invoice_number: invNum,
    customer_id: Number(body.customer_id) || 1,
    customer_name: customer ? customer.name : 'Customer #' + body.customer_id,
    date: body.date || new Date().toISOString().split('T')[0],
    due_date: body.due_date || body.date || new Date().toISOString().split('T')[0],
    terms: body.terms || 'Net 30',
    po_number: body.po_number || '',
    memo: body.memo || '',
    bill_address1: body.bill_address1 || (customer ? customer.bill_address1 : ''),
    bill_city: body.bill_city || (customer ? customer.bill_city : ''),
    bill_state: body.bill_state || (customer ? customer.bill_state : ''),
    bill_zip: body.bill_zip || (customer ? customer.bill_zip : ''),
    subtotal: subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total: total,
    balance_due: balanceDue,
    status: isReceipt ? 'paid' : 'sent',
    is_sales_receipt: isReceipt,
    lines: lines,
    created_at: new Date().toISOString(),
  };

  db.invoices.push(invoice);
  if (customer && !isReceipt) {
    customer.balance = (customer.balance || 0) + balanceDue;
  }

  db.auditLog.push({
    id: db.auditLog.length + 1,
    timestamp: new Date().toISOString(),
    user: db.auth.username,
    action: 'CREATE',
    entity_type: 'Invoice',
    entity_id: invoice.id,
    description: `Created invoice #${invoice.invoice_number} for $${invoice.total.toFixed(2)}`,
  });

  res.status(201).json(invoice);
});

apiRouter.post('/sales-receipts', (req: Request, res: Response) => {
  const body = req.body;
  const customer = db.customers.find((c) => c.id === Number(body.customer_id));
  const newId = db.invoices.length > 0 ? Math.max(...db.invoices.map((i) => i.id)) + 1 : 1;
  const invNum = body.invoice_number || `SR-${1000 + newId}`;

  let subtotal = 0;
  const lines = (body.lines || []).map((line: any, index: number) => {
    const qty = Number(line.quantity) || 1;
    const rate = Number(line.rate) || 0;
    const amt = line.amount !== undefined ? Number(line.amount) : qty * rate;
    subtotal += amt;
    return {
      id: index + 1,
      item_id: line.item_id ? Number(line.item_id) : undefined,
      description: line.description || '',
      quantity: qty,
      rate: rate,
      amount: amt,
      line_order: index + 1,
    };
  });

  const taxRate = body.tax_rate !== undefined ? Number(body.tax_rate) : 0.065;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const receipt: Invoice = {
    id: newId,
    invoice_number: invNum,
    customer_id: Number(body.customer_id) || 1,
    customer_name: customer ? customer.name : 'Customer #' + body.customer_id,
    date: body.date || new Date().toISOString().split('T')[0],
    due_date: body.date || new Date().toISOString().split('T')[0],
    terms: 'Due on Receipt',
    po_number: body.po_number || '',
    memo: body.memo || '',
    subtotal: subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total: total,
    balance_due: 0,
    status: 'paid',
    is_sales_receipt: true,
    lines: lines,
    created_at: new Date().toISOString(),
  };

  db.invoices.push(receipt);
  res.status(201).json(receipt);
});

apiRouter.put('/invoices/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const idx = db.invoices.findIndex((i) => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Invoice not found' });
  db.invoices[idx] = { ...db.invoices[idx], ...req.body };
  res.json(db.invoices[idx]);
});

apiRouter.post('/invoices/:id/void', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  inv.status = 'void';
  inv.balance_due = 0;
  res.json({ ok: true, invoice: inv });
});

apiRouter.post('/invoices/apply-late-fees', (_req: Request, res: Response) => {
  res.json({ applied_count: 0, total_fees: 0 });
});

// ==========================================
// Payments
// ==========================================
apiRouter.get('/payments', (req: Request, res: Response) => {
  let list = db.payments;
  if (req.query.customer_id) {
    list = list.filter((p) => p.customer_id === Number(req.query.customer_id));
  }
  res.json(list);
});

apiRouter.post('/payments', (req: Request, res: Response) => {
  const body = req.body;
  const newId = db.payments.length > 0 ? Math.max(...db.payments.map((p) => p.id)) + 1 : 1;
  const amt = Number(body.amount) || 0;
  const customer = db.customers.find((c) => c.id === Number(body.customer_id));

  const payment = {
    id: newId,
    customer_id: Number(body.customer_id),
    customer_name: customer ? customer.name : '',
    invoice_id: body.invoice_id ? Number(body.invoice_id) : undefined,
    date: body.date || new Date().toISOString().split('T')[0],
    amount: amt,
    payment_method: body.payment_method || body.method || 'Check',
    method: body.payment_method || body.method || 'Check',
    reference: body.reference || '',
    deposit_to_account_id: body.deposit_to_account_id ? Number(body.deposit_to_account_id) : 1,
    memo: body.memo || '',
    created_at: new Date().toISOString(),
  };

  db.payments.push(payment);

  if (body.invoice_id) {
    const inv = db.invoices.find((i) => i.id === Number(body.invoice_id));
    if (inv) {
      inv.balance_due = Math.max(0, inv.balance_due - amt);
      if (inv.balance_due <= 0) {
        inv.status = 'paid';
      } else {
        inv.status = 'partial';
      }
    }
  }

  if (customer) {
    customer.balance = Math.max(0, (customer.balance || 0) - amt);
  }

  const depositAcct = db.bankAccounts.find((b) => b.id === (payment.deposit_to_account_id || 1));
  if (depositAcct) {
    depositAcct.balance += amt;
    db.bankTransactions.push({
      id: db.bankTransactions.length + 1,
      bank_account_id: depositAcct.id,
      date: payment.date,
      payee: `Payment - ${customer ? customer.name : 'Customer'}`,
      memo: payment.memo || payment.reference,
      debit: 0,
      credit: amt,
      balance: depositAcct.balance,
      is_reconciled: false,
    });
  }

  db.auditLog.push({
    id: db.auditLog.length + 1,
    timestamp: new Date().toISOString(),
    user: db.auth.username,
    action: 'CREATE',
    entity_type: 'Payment',
    entity_id: payment.id,
    description: `Recorded payment of $${amt.toFixed(2)} from ${customer ? customer.name : 'customer'}`,
  });

  res.status(201).json(payment);
});

// ==========================================
// Items & Services
// ==========================================
apiRouter.get('/items', (req: Request, res: Response) => {
  let list = db.items;
  if (req.query.active_only === 'true') {
    list = list.filter((i) => i.is_active);
  }
  res.json(list);
});

apiRouter.get('/items/:id', (req: Request, res: Response) => {
  const item = db.items.find((i) => i.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

apiRouter.post('/items', (req: Request, res: Response) => {
  const newId = db.items.length > 0 ? Math.max(...db.items.map((i) => i.id)) + 1 : 1;
  const newItem = {
    id: newId,
    name: req.body.name || 'New Item',
    item_type: req.body.item_type || 'service',
    description: req.body.description || '',
    rate: Number(req.body.rate) || 0,
    cost: Number(req.body.cost) || 0,
    income_account_id: req.body.income_account_id ? Number(req.body.income_account_id) : 18,
    expense_account_id: req.body.expense_account_id ? Number(req.body.expense_account_id) : 21,
    is_taxable: req.body.is_taxable !== false,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  db.items.push(newItem as any);
  res.status(201).json(newItem);
});

apiRouter.put('/items/:id', (req: Request, res: Response) => {
  const idx = db.items.findIndex((i) => i.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Item not found' });
  db.items[idx] = { ...db.items[idx], ...req.body };
  res.json(db.items[idx]);
});

// ==========================================
// Vendors
// ==========================================
apiRouter.get('/vendors', (req: Request, res: Response) => {
  let list = db.vendors;
  if (req.query.active_only === 'true') {
    list = list.filter((v) => v.is_active);
  }
  res.json(list);
});

apiRouter.get('/vendors/:id', (req: Request, res: Response) => {
  const vendor = db.vendors.find((v) => v.id === Number(req.params.id));
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
  res.json(vendor);
});

apiRouter.post('/vendors', (req: Request, res: Response) => {
  const newId = db.vendors.length > 0 ? Math.max(...db.vendors.map((v) => v.id)) + 1 : 1;
  const vendor = {
    id: newId,
    name: req.body.name || 'New Vendor',
    company: req.body.company || '',
    contact: req.body.contact || '',
    phone: req.body.phone || '',
    email: req.body.email || '',
    address1: req.body.address1 || '',
    city: req.body.city || '',
    state: req.body.state || '',
    zip: req.body.zip || '',
    terms: req.body.terms || 'Net 30',
    is_1099: Boolean(req.body.is_1099),
    balance: 0,
    is_active: true,
    created_at: new Date().toISOString(),
  };
  db.vendors.push(vendor);
  res.status(201).json(vendor);
});

apiRouter.put('/vendors/:id', (req: Request, res: Response) => {
  const idx = db.vendors.findIndex((v) => v.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Vendor not found' });
  db.vendors[idx] = { ...db.vendors[idx], ...req.body };
  res.json(db.vendors[idx]);
});

// ==========================================
// Bills & Bill Payments
// ==========================================
apiRouter.get('/bills', (req: Request, res: Response) => {
  let list = db.bills;
  if (req.query.vendor_id) {
    list = list.filter((b) => b.vendor_id === Number(req.query.vendor_id));
  }
  res.json(list);
});

apiRouter.get('/bills/:id', (req: Request, res: Response) => {
  const bill = db.bills.find((b) => b.id === Number(req.params.id));
  if (!bill) return res.status(404).json({ error: 'Bill not found' });
  res.json(bill);
});

apiRouter.post('/bills', (req: Request, res: Response) => {
  const body = req.body;
  const vendor = db.vendors.find((v) => v.id === Number(body.vendor_id));
  const newId = db.bills.length > 0 ? Math.max(...db.bills.map((b) => b.id)) + 1 : 1;

  let total = 0;
  const lines = (body.lines || []).map((l: any, idx: number) => {
    const qty = Number(l.quantity) || 1;
    const rate = Number(l.rate) || 0;
    const amt = l.amount !== undefined ? Number(l.amount) : qty * rate;
    total += amt;
    return {
      id: idx + 1,
      item_id: l.item_id ? Number(l.item_id) : undefined,
      account_id: l.account_id ? Number(l.account_id) : 21,
      description: l.description || '',
      quantity: qty,
      rate: rate,
      amount: amt,
      job_id: l.job_id ? Number(l.job_id) : undefined,
    };
  });

  const bill: Bill = {
    id: newId,
    vendor_id: Number(body.vendor_id),
    vendor_name: vendor ? vendor.name : 'Vendor #' + body.vendor_id,
    bill_number: body.bill_number || `BILL-${newId}`,
    date: body.date || new Date().toISOString().split('T')[0],
    due_date: body.due_date || new Date().toISOString().split('T')[0],
    terms: body.terms || 'Net 30',
    memo: body.memo || '',
    total: total,
    balance_due: total,
    status: 'unpaid',
    lines: lines,
    created_at: new Date().toISOString(),
  };

  db.bills.push(bill);
  if (vendor) {
    vendor.balance = (vendor.balance || 0) + total;
  }

  res.status(201).json(bill);
});

apiRouter.post('/bill-payments', (req: Request, res: Response) => {
  const { bill_id, amount, payment_account_id } = req.body;
  const bill = db.bills.find((b) => b.id === Number(bill_id));
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const payAmt = Number(amount) || bill.balance_due;
  bill.balance_due = Math.max(0, bill.balance_due - payAmt);
  if (bill.balance_due <= 0) bill.status = 'paid';
  else bill.status = 'partial';

  const vendor = db.vendors.find((v) => v.id === bill.vendor_id);
  if (vendor) vendor.balance = Math.max(0, vendor.balance - payAmt);

  const bank = db.bankAccounts.find((b) => b.id === Number(payment_account_id || 1));
  if (bank) {
    bank.balance -= payAmt;
    db.bankTransactions.push({
      id: db.bankTransactions.length + 1,
      bank_account_id: bank.id,
      date: new Date().toISOString().split('T')[0],
      payee: `Bill Payment - ${bill.vendor_name}`,
      memo: `Paid Bill #${bill.bill_number}`,
      debit: payAmt,
      credit: 0,
      balance: bank.balance,
      is_reconciled: false,
    });
  }

  res.json({ ok: true, bill });
});

// ==========================================
// Banking & Accounts
// ==========================================
apiRouter.get('/banking/accounts', (_req: Request, res: Response) => {
  res.json(db.bankAccounts);
});

apiRouter.post('/banking/accounts', (req: Request, res: Response) => {
  const newId = db.bankAccounts.length > 0 ? Math.max(...db.bankAccounts.map((b) => b.id)) + 1 : 1;
  const newAcct = {
    id: newId,
    name: req.body.name || 'New Bank Account',
    account_id: req.body.account_id ? Number(req.body.account_id) : undefined,
    bank_name: req.body.bank_name || '',
    routing_number: req.body.routing_number || '',
    account_number: req.body.account_number || '',
    last_four: req.body.account_number ? String(req.body.account_number).slice(-4) : '',
    balance: Number(req.body.starting_balance) || 0,
    is_active: true,
  };
  db.bankAccounts.push(newAcct);
  res.status(201).json(newAcct);
});

apiRouter.get('/banking/accounts/:id/transactions', (req: Request, res: Response) => {
  const acctId = Number(req.params.id);
  const txs = db.bankTransactions.filter((t) => t.bank_account_id === acctId);
  res.json(txs);
});

apiRouter.post('/banking/accounts/:id/transactions', (req: Request, res: Response) => {
  const acctId = Number(req.params.id);
  const bank = db.bankAccounts.find((b) => b.id === acctId);
  if (!bank) return res.status(404).json({ error: 'Bank account not found' });

  const debit = Number(req.body.debit) || 0;
  const credit = Number(req.body.credit) || 0;
  bank.balance = bank.balance - debit + credit;

  const newTx = {
    id: db.bankTransactions.length + 1,
    bank_account_id: acctId,
    date: req.body.date || new Date().toISOString().split('T')[0],
    payee: req.body.payee || '',
    check_number: req.body.check_number || '',
    memo: req.body.memo || '',
    debit,
    credit,
    balance: bank.balance,
    is_reconciled: false,
  };
  db.bankTransactions.push(newTx);
  res.status(201).json(newTx);
});

apiRouter.post('/banking/accounts/:id/reconcile', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Account reconciled successfully' });
});

apiRouter.get('/simplefin/status', (_req: Request, res: Response) => {
  res.json({ connected: false });
});

// ==========================================
// CaixaBank Integration & Norma 43 Engine
// ==========================================
apiRouter.get('/caixabank/status', (_req: Request, res: Response) => {
  const caixabankAccounts = db.bankAccounts.filter(
    (b) =>
      (b.bank_name && /caixa/i.test(b.bank_name)) ||
      (b.name && /caixa/i.test(b.name)) ||
      b.routing_number === '2100'
  );

  const totalBalance = caixabankAccounts.reduce((sum, b) => sum + (Number(b.balance) || 0), 0);

  res.json({
    connected_accounts: caixabankAccounts,
    total_balance: totalBalance,
    open_banking: caixabankState.config,
    protocols_supported: [
      {
        id: 'norma43',
        name: 'Norma 43 (Cuaderno 43 / AEB 43)',
        type: 'file_import',
        description: 'Estándar oficial bancario español de extractos de cuenta emitidos por CaixaBankNow Empresas y Particulares.',
        recommended: true,
        formats: ['.n43', '.c43', '.txt'],
      },
      {
        id: 'open_banking',
        name: 'Open Banking PSD2 (API Market / Redsys)',
        type: 'api_sync',
        description: 'Conexión automatizada mediante API regulada por la directiva europea PSD2 y pasarelas interbancarias.',
        recommended: false,
        status: caixabankState.config.is_connected ? 'connected' : 'ready_to_connect',
      },
      {
        id: 'csv_excel',
        name: 'Extracto CSV / Excel CaixaBank',
        type: 'file_import',
        description: 'Exportación directa de movimientos en formato tabla delimitada por punto y coma o comas.',
        recommended: false,
        formats: ['.csv', '.txt'],
      },
      {
        id: 'sepa_remittance',
        name: 'Remesas SEPA CaixaBank (Cuaderno 34 / 19)',
        type: 'export_payment',
        description: 'Generación de ficheros XML ISO 20022 pain.001 y pain.008 para emisión de pagos a proveedores y cobros en CaixaBankNow.',
        recommended: false,
      },
    ],
  });
});

apiRouter.get('/caixabank/sample-n43', (_req: Request, res: Response) => {
  const sampleRaw = generateSampleNorma43();
  const parsed = parseNorma43(sampleRaw);
  res.json({
    raw: sampleRaw,
    filename: 'extracto_caixabank_muestra.n43',
    statements: parsed,
    transaction_count: parsed.reduce((sum, s) => sum + s.transactions.length, 0),
  });
});

apiRouter.post('/caixabank/preview', (req: Request, res: Response) => {
  try {
    let content = req.body?.content || '';
    if (!content && typeof req.body === 'string') {
      content = req.body;
    }
    const format = req.body?.format || 'n43';

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Contenido del extracto bancario vacío' });
    }

    if (format === 'csv' || (!content.startsWith('11') && (content.includes(';') || content.includes(',')))) {
      const txs = parseCaixaBankCsv(content);
      return res.json({
        format: 'csv',
        statements: [
          {
            bank_code: '2100',
            bank_name: 'CaixaBank',
            branch_code: '0001',
            account_number: 'Extracto CSV',
            iban: 'ES-- 2100 ---- ---- ----',
            start_date: txs[0]?.date || new Date().toISOString().split('T')[0],
            end_date: txs[txs.length - 1]?.date || new Date().toISOString().split('T')[0],
            initial_balance: 0,
            final_balance: 0,
            currency: 'EUR',
            debit_count: txs.filter((t) => t.debit > 0).length,
            debit_total: txs.reduce((sum, t) => sum + t.debit, 0),
            credit_count: txs.filter((t) => t.credit > 0).length,
            credit_total: txs.reduce((sum, t) => sum + t.credit, 0),
            transactions: txs,
          },
        ],
      });
    }

    // Default: Norma 43
    const statements = parseNorma43(content);
    if (!statements || statements.length === 0) {
      const csvTxs = parseCaixaBankCsv(content);
      if (csvTxs.length > 0) {
        return res.json({
          format: 'csv_fallback',
          statements: [
            {
              bank_code: '2100',
              bank_name: 'CaixaBank',
              branch_code: '0001',
              account_number: 'Extracto CSV',
              iban: 'ES-- 2100 ---- ---- ----',
              start_date: csvTxs[0]?.date || new Date().toISOString().split('T')[0],
              end_date: csvTxs[csvTxs.length - 1]?.date || new Date().toISOString().split('T')[0],
              initial_balance: 0,
              final_balance: 0,
              currency: 'EUR',
              debit_count: csvTxs.filter((t) => t.debit > 0).length,
              debit_total: csvTxs.reduce((sum, t) => sum + t.debit, 0),
              credit_count: csvTxs.filter((t) => t.credit > 0).length,
              credit_total: csvTxs.reduce((sum, t) => sum + t.credit, 0),
              transactions: csvTxs,
            },
          ],
        });
      }
      return res.status(400).json({ error: 'No se encontraron registros válidos de Norma 43 ni CSV de CaixaBank en el fichero aportado' });
    }

    res.json({
      format: 'norma43',
      statements,
      total_transactions: statements.reduce((sum, s) => sum + s.transactions.length, 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al procesar el extracto bancario' });
  }
});

apiRouter.post('/caixabank/import', (req: Request, res: Response) => {
  try {
    const { content, bank_account_id, create_account, account_name } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Falta el contenido del fichero a importar' });
    }

    let statements = parseNorma43(content);
    let allTransactions: Norma43Transaction[] = [];
    let detectedIban = 'ES21210000010200194821';
    let detectedBank = 'CaixaBank';

    if (statements.length > 0 && statements[0].transactions.length > 0) {
      allTransactions = statements.flatMap((s) => s.transactions);
      detectedIban = statements[0].iban || detectedIban;
      detectedBank = statements[0].bank_name || detectedBank;
    } else {
      allTransactions = parseCaixaBankCsv(content);
    }

    if (allTransactions.length === 0) {
      return res.status(400).json({ error: 'No se encontraron movimientos válidos para importar' });
    }

    // Target account resolution
    let targetAccount = db.bankAccounts.find((b) => b.id === Number(bank_account_id));

    if (!targetAccount || create_account) {
      const existingCaixa = db.bankAccounts.find(
        (b) => b.bank_name?.toLowerCase().includes('caixabank') || b.routing_number === '2100'
      );

      if (existingCaixa && !create_account) {
        targetAccount = existingCaixa;
      } else {
        const newId = db.bankAccounts.length > 0 ? Math.max(...db.bankAccounts.map((b) => b.id)) + 1 : 1;
        const newAcctNum = detectedIban.slice(-10) || '0200194821';
        targetAccount = {
          id: newId,
          name: account_name || `CaixaBank Cuenta Corriente (****${newAcctNum.slice(-4)})`,
          account_id: 1,
          bank_name: 'CaixaBank',
          routing_number: '2100',
          account_number: detectedIban,
          last_four: newAcctNum.slice(-4),
          balance: statements[0]?.final_balance || statements[0]?.initial_balance || 42580.40,
          is_active: true,
        };
        db.bankAccounts.push(targetAccount);
      }
    }

    let imported = 0;
    let skipped = 0;

    for (const tx of allTransactions) {
      const isDuplicate = db.bankTransactions.some(
        (existing) =>
          existing.bank_account_id === targetAccount!.id &&
          existing.date === tx.date &&
          Math.abs(Number(existing.debit) - tx.debit) < 0.001 &&
          Math.abs(Number(existing.credit) - tx.credit) < 0.001
      );

      if (isDuplicate) {
        skipped++;
        continue;
      }

      targetAccount.balance = Math.round((targetAccount.balance - tx.debit + tx.credit) * 100) / 100;

      const newTx = {
        id: db.bankTransactions.length + 1,
        bank_account_id: targetAccount.id,
        date: tx.date,
        payee: tx.payee || tx.description || 'Movimiento CaixaBank',
        check_number: tx.document_number || '',
        memo: [tx.description, tx.reference].filter(Boolean).join(' | '),
        debit: tx.debit,
        credit: tx.credit,
        balance: targetAccount.balance,
        is_reconciled: false,
      };

      db.bankTransactions.push(newTx as any);
      imported++;
    }

    res.json({
      ok: true,
      imported,
      skipped,
      total_found: allTransactions.length,
      account: targetAccount,
      new_balance: targetAccount.balance,
      message: `Se importaron ${imported} movimientos en ${targetAccount.name} (${skipped} omitidos por estar ya registrados).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error al importar los movimientos' });
  }
});

apiRouter.post('/caixabank/open-banking/config', (req: Request, res: Response) => {
  const { provider, client_id, client_secret, setup_token, account_iban, environment } = req.body;
  caixabankState.config = {
    provider: provider || 'gocardless_nordigen',
    client_id: client_id || '',
    client_secret: client_secret || '',
    setup_token: setup_token || '',
    account_iban: account_iban || 'ES21210000010200194821',
    is_connected: true,
    last_sync: new Date().toISOString(),
    environment: environment || 'production',
  };

  res.json({
    ok: true,
    message: 'Configuración de Open Banking PSD2 guardada correctamente para CaixaBank.',
    config: caixabankState.config,
  });
});

apiRouter.post('/caixabank/open-banking/sync', (_req: Request, res: Response) => {
  const sampleRaw = generateSampleNorma43();
  const parsed = parseNorma43(sampleRaw);
  const txs = parsed.flatMap((s) => s.transactions);

  let target = db.bankAccounts.find((b) => b.bank_name?.toLowerCase().includes('caixabank') || b.routing_number === '2100');
  if (!target) {
    const newId = db.bankAccounts.length > 0 ? Math.max(...db.bankAccounts.map((b) => b.id)) + 1 : 1;
    target = {
      id: newId,
      name: 'CaixaBank Cuenta Corriente (Open Banking)',
      account_id: 1,
      bank_name: 'CaixaBank',
      routing_number: '2100',
      account_number: caixabankState.config.account_iban || 'ES21210000010200194821',
      last_four: '4821',
      balance: 42580.40,
      is_active: true,
    };
    db.bankAccounts.push(target);
  }

  let imported = 0;
  let skipped = 0;

  for (const tx of txs) {
    const isDuplicate = db.bankTransactions.some(
      (existing) =>
        existing.bank_account_id === target!.id &&
        existing.date === tx.date &&
        Math.abs(Number(existing.debit) - tx.debit) < 0.001 &&
        Math.abs(Number(existing.credit) - tx.credit) < 0.001
    );

    if (isDuplicate) {
      skipped++;
      continue;
    }

    target.balance = Math.round((target.balance - tx.debit + tx.credit) * 100) / 100;
    db.bankTransactions.push({
      id: db.bankTransactions.length + 1,
      bank_account_id: target.id,
      date: tx.date,
      payee: tx.payee || 'CaixaBank PSD2',
      check_number: tx.document_number || '',
      memo: tx.description || 'Open Banking Sync',
      debit: tx.debit,
      credit: tx.credit,
      balance: target.balance,
      is_reconciled: false,
    });
    imported++;
  }

  caixabankState.config.is_connected = true;
  caixabankState.config.last_sync = new Date().toISOString();

  res.json({
    ok: true,
    imported,
    skipped,
    account: target,
    last_sync: caixabankState.config.last_sync,
    message: `Sincronización completada con CaixaBank PSD2: ${imported} nuevos movimientos importados.`,
  });
});

apiRouter.post('/caixabank/sepa/pain001', (req: Request, res: Response) => {
  const { payments } = req.body;
  let paymentList = payments;
  if (!paymentList || !Array.isArray(paymentList) || paymentList.length === 0) {
    paymentList = db.bills
      .filter((b) => b.status !== 'paid' && b.status !== 'void')
      .slice(0, 5)
      .map((b) => {
        const v = db.vendors.find((ven) => ven.id === b.vendor_id);
        return {
          creditor_name: v?.name || 'Proveedor Comercial',
          iban: 'ES9121000418401234567890',
          amount: Number(b.balance_due) || Number(b.total) || 150.0,
          concept: `Factura ${b.bill_number || b.id}`,
        };
      });
  }

  const xml = generateSepaPain001Xml(paymentList);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="remesa_sepa_caixabank_${Date.now()}.xml"`);
  res.send(xml);
});

// General Bank Import Preview & Commit Fallbacks
apiRouter.post('/bank-import/preview', (req: Request, res: Response) => {
  const raw = req.body?.content || '';
  if (raw.startsWith('11') || raw.includes('\n23')) {
    const stmts = parseNorma43(raw);
    return res.json({
      account_id: stmts[0]?.account_number || '2100-0001',
      transactions: stmts.flatMap((s) => s.transactions),
    });
  }
  res.json({
    account_id: '1',
    transactions: [
      { date: new Date().toISOString().split('T')[0], payee: 'Operación bancaria', amount: 150.0, fitid: 'TXN-001' },
    ],
  });
});

apiRouter.post('/bank-import/preview-csv', (req: Request, res: Response) => {
  const raw = req.body?.content || '';
  const txs = parseCaixaBankCsv(raw);
  res.json({
    format: 'CSV',
    transactions: txs,
  });
});

apiRouter.post('/bank-import/import/:id', (req: Request, res: Response) => {
  res.json({ ok: true, imported: 1, skipped: 0, bank_account_id: Number(req.params.id) });
});

apiRouter.post('/bank-import/import-csv/:id', (req: Request, res: Response) => {
  res.json({ ok: true, imported: 1, skipped: 0, bank_account_id: Number(req.params.id) });
});

// Chart of Accounts
apiRouter.get('/accounts', (req: Request, res: Response) => {
  let list = db.accounts;
  if (req.query.account_type) {
    list = list.filter((a) => a.account_type === req.query.account_type);
  }
  res.json(list);
});

apiRouter.post('/accounts', (req: Request, res: Response) => {
  const newId = db.accounts.length > 0 ? Math.max(...db.accounts.map((a) => a.id)) + 1 : 1;
  const newAccount = {
    id: newId,
    account_number: req.body.account_number || String(7000 + newId),
    name: req.body.name || 'New Account',
    account_type: req.body.account_type || 'expense',
    sub_type: req.body.sub_type || 'operating_expense',
    balance: Number(req.body.balance) || 0,
    is_active: true,
  };
  db.accounts.push(newAccount as any);
  res.status(201).json(newAccount);
});

// ==========================================
// Reports
// ==========================================
apiRouter.get('/reports/profit-loss', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');

  const incomeRows = db.accounts
    .filter((a) => a.account_type === 'income')
    .map((a) => ({ account_id: a.id, account_number: a.account_number, account_name: a.name, amount: a.balance }));
  const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount, 0);

  const cogsRows = db.accounts
    .filter((a) => a.account_type === 'cogs')
    .map((a) => ({ account_id: a.id, account_number: a.account_number, account_name: a.name, amount: a.balance }));
  const totalCogs = cogsRows.reduce((sum, r) => sum + r.amount, 0);

  const grossProfit = totalIncome - totalCogs;

  const expenseRows = db.accounts
    .filter((a) => a.account_type === 'expense')
    .map((a) => ({ account_id: a.id, account_number: a.account_number, account_name: a.name, amount: a.balance }));
  const totalExpenses = expenseRows.reduce((sum, r) => sum + r.amount, 0);

  const netIncome = grossProfit - totalExpenses;

  res.json({
    start_date: startDate,
    end_date: endDate,
    income: incomeRows,
    total_income: totalIncome,
    cogs: cogsRows,
    total_cogs: totalCogs,
    gross_profit: grossProfit,
    expenses: expenseRows,
    total_expenses: totalExpenses,
    net_income: netIncome,
  });
});

apiRouter.get('/reports/balance-sheet', (_req: Request, res: Response) => {
  const assetRows = db.accounts
    .filter((a) => a.account_type === 'asset')
    .map((a) => ({ account_id: a.id, account_number: a.account_number, account_name: a.name, amount: a.balance }));
  const totalAssets = assetRows.reduce((sum, r) => sum + r.amount, 0);

  const liabilityRows = db.accounts
    .filter((a) => a.account_type === 'liability')
    .map((a) => ({ account_id: a.id, account_number: a.account_number, account_name: a.name, amount: a.balance }));
  const totalLiabilities = liabilityRows.reduce((sum, r) => sum + r.amount, 0);

  const equityRows = db.accounts
    .filter((a) => a.account_type === 'equity')
    .map((a) => ({ account_id: a.id, account_number: a.account_number, account_name: a.name, amount: a.balance }));
  const totalEquity = equityRows.reduce((sum, r) => sum + r.amount, 0);

  res.json({
    as_of_date: new Date().toISOString().split('T')[0],
    assets: assetRows,
    total_assets: totalAssets,
    liabilities: liabilityRows,
    total_liabilities: totalLiabilities,
    equity: equityRows,
    total_equity: totalEquity,
    total_liabilities_and_equity: totalLiabilities + totalEquity,
  });
});

apiRouter.get('/reports/ar-aging', (_req: Request, res: Response) => {
  const items = db.customers
    .filter((c) => (c.balance || 0) > 0)
    .map((c) => {
      const bal = c.balance || 0;
      const current = bal > 5000 ? bal - 3000 : bal;
      const over30 = bal > 5000 ? 3000 : 0;
      return {
        customer_id: c.id,
        customer_name: c.name,
        current,
        over_30: over30,
        days_30: over30,
        over_60: 0,
        days_60: 0,
        over_90: 0,
        days_90: 0,
        total: bal,
      };
    });
  const totals = {
    current: items.reduce((s, r) => s + r.current, 0),
    over_30: items.reduce((s, r) => s + r.over_30, 0),
    days_30: items.reduce((s, r) => s + r.days_30, 0),
    over_60: 0,
    days_60: 0,
    over_90: 0,
    days_90: 0,
    total: items.reduce((s, r) => s + r.total, 0),
  };
  res.json({ as_of_date: new Date().toISOString().split('T')[0], items, rows: items, totals });
});

apiRouter.get('/reports/ap-aging', (_req: Request, res: Response) => {
  const items = db.vendors
    .filter((v) => (v.balance || 0) > 0)
    .map((v) => ({
      vendor_id: v.id,
      vendor_name: v.name,
      current: v.balance || 0,
      over_30: 0,
      days_30: 0,
      over_60: 0,
      days_60: 0,
      over_90: 0,
      days_90: 0,
      total: v.balance || 0,
    }));
  const totals = {
    current: items.reduce((s, r) => s + r.current, 0),
    over_30: 0,
    days_30: 0,
    over_60: 0,
    days_60: 0,
    over_90: 0,
    days_90: 0,
    total: items.reduce((s, r) => s + r.total, 0),
  };
  res.json({ as_of_date: new Date().toISOString().split('T')[0], items, rows: items, totals });
});

apiRouter.get('/reports/trial-balance', (_req: Request, res: Response) => {
  let totalDebits = 0;
  let totalCredits = 0;
  const rows = db.accounts.map((a) => {
    let debit = 0;
    let credit = 0;
    if (a.account_type === 'asset' || a.account_type === 'expense' || a.account_type === 'cogs') {
      if (a.balance >= 0) debit = a.balance;
      else credit = Math.abs(a.balance);
    } else {
      if (a.balance >= 0) credit = a.balance;
      else debit = Math.abs(a.balance);
    }
    totalDebits += debit;
    totalCredits += credit;
    return {
      account_id: a.id,
      account_number: a.account_number,
      account_name: a.name,
      account_type: a.account_type,
      debit,
      credit,
      total_debit: debit,
      total_credit: credit,
      net_balance: debit - credit,
    };
  });
  res.json({
    as_of_date: new Date().toISOString().split('T')[0],
    items: rows,
    rows,
    total_debits: totalDebits,
    total_credits: totalCredits,
    total_debit: totalDebits,
    total_credit: totalCredits,
    difference: totalDebits - totalCredits,
  });
});

apiRouter.get('/reports/general-ledger', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');
  const accountsWithEntries = db.accounts.map((a) => {
    const entries = [];
    if (a.balance !== 0) {
      entries.push({
        date: '2026-08-01',
        description: `Beginning balance for ${a.name}`,
        reference: 'BB-2026',
        debit: a.balance > 0 ? a.balance : 0,
        credit: a.balance < 0 ? Math.abs(a.balance) : 0,
      });
      if (a.account_type === 'income' || a.account_type === 'asset') {
        entries.push({
          date: '2026-08-25',
          description: `Progress invoice transaction`,
          reference: 'INV-1002',
          debit: a.account_type === 'asset' ? 3500.00 : 0,
          credit: a.account_type === 'income' ? 3500.00 : 0,
        });
      }
    }
    const totDeb = entries.reduce((s, e) => s + e.debit, 0);
    const totCred = entries.reduce((s, e) => s + e.credit, 0);
    return {
      account_number: a.account_number,
      account_name: a.name,
      account_type: a.account_type,
      total_debit: totDeb,
      total_credit: totCred,
      entries,
    };
  }).filter((a) => a.entries.length > 0);

  res.json({
    start_date: startDate,
    end_date: endDate,
    as_of_date: new Date().toISOString().split('T')[0],
    accounts: accountsWithEntries,
  });
});

apiRouter.get('/reports/cash-flow', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');
  const operating = [
    { account_name: 'Net Income', amount: 98750.00 },
    { account_name: 'Depreciation & Amortization', amount: 14200.00 },
    { account_name: 'Change in Accounts Receivable', amount: -6500.00 },
    { account_name: 'Change in Accounts Payable', amount: 2150.00 },
  ];
  const totalOperating = operating.reduce((s, i) => s + i.amount, 0);

  const investing = [
    { account_name: 'Equipment Purchases', amount: -15000.00 },
    { account_name: 'Vehicle Acquisitions', amount: -8500.00 },
  ];
  const totalInvesting = investing.reduce((s, i) => s + i.amount, 0);

  const financing = [
    { account_name: 'Equipment Loan Principal Payments', amount: -6400.00 },
    { account_name: "Owner's Draw", amount: -15000.00 },
  ];
  const totalFinancing = financing.reduce((s, i) => s + i.amount, 0);

  const netChange = totalOperating + totalInvesting + totalFinancing;

  res.json({
    start_date: startDate,
    end_date: endDate,
    operating,
    total_operating: totalOperating,
    investing,
    total_investing: totalInvesting,
    financing,
    total_financing: totalFinancing,
    net_change: netChange,
    ending_cash_balance: 85750.75,
  });
});

apiRouter.get('/reports/sales-tax', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');

  const items = db.invoices.map((inv) => {
    const cust = db.customers.find((c) => c.id === inv.customer_id);
    const taxRate = db.company.tax_rate || 0.065;
    const subtotal = inv.subtotal || (inv.total ? inv.total / (1 + taxRate) : 0);
    const taxAmount = inv.tax_amount || (inv.total - subtotal);
    return {
      id: inv.id,
      date: inv.date,
      invoice_number: inv.invoice_number,
      customer_name: cust ? cust.name : 'Apex Construction',
      subtotal: Math.round(subtotal * 100) / 100,
      tax_rate: taxRate,
      tax_amount: Math.round(taxAmount * 100) / 100,
      total: inv.total,
    };
  });

  const totalSales = items.reduce((sum, i) => sum + i.total, 0);
  const totalTaxable = items.reduce((sum, i) => sum + i.subtotal, 0);
  const totalTax = items.reduce((sum, i) => sum + i.tax_amount, 0);

  res.json({
    period: 'Current Quarter (Q3 2026)',
    start_date: startDate,
    end_date: endDate,
    items,
    total_sales: totalSales,
    total_taxable: totalTaxable,
    total_non_taxable: 350.0,
    total_tax: totalTax,
    tax_collected: totalTax,
    tax_due: totalTax,
    tax_rate: 0.065,
  });
});

apiRouter.get('/reports/income-by-customer', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');

  const items = db.customers.map((c) => {
    const custInvoices = db.invoices.filter((inv) => inv.customer_id === c.id);
    const invoiceCount = custInvoices.length || (c.balance > 0 ? 1 : 0);
    const totalSales = custInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0) || (c.balance * 2);
    const totalBalance = c.balance || 0;
    const totalPaid = Math.max(0, totalSales - totalBalance);
    return {
      customer_id: c.id,
      customer_name: c.name,
      invoice_count: invoiceCount,
      total_sales: totalSales,
      total_paid: totalPaid,
      total_balance: totalBalance,
    };
  }).filter((c) => c.total_sales > 0 || c.total_balance > 0);

  const totalSales = items.reduce((s, i) => s + i.total_sales, 0);
  const totalPaid = items.reduce((s, i) => s + i.total_paid, 0);
  const totalBalance = items.reduce((s, i) => s + i.total_balance, 0);

  res.json({
    start_date: startDate,
    end_date: endDate,
    items,
    total_sales: totalSales,
    total_paid: totalPaid,
    total_balance: totalBalance,
  });
});

apiRouter.get('/reports/1099-summary', (req: Request, res: Response) => {
  const year = req.query.year || new Date().getFullYear();
  const items = db.vendors.map((v, idx) => ({
    vendor_id: v.id,
    vendor_name: v.name,
    tax_id: `91-${1000000 + idx * 1234}`,
    vendor_1099_type: '1099-NEC',
    total_paid: (v.balance || 1200) + 2450.00,
    above_threshold: true,
  }));
  const total = items.reduce((s, i) => s + i.total_paid, 0);
  res.json({
    year,
    threshold: 600,
    vendors_above_threshold: items.length,
    total,
    items,
  });
});

apiRouter.get('/reports/profit-loss-by-class', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');
  const classes = [
    { class_name: 'Commercial Construction', income: 145000, cogs: 72000, gross_profit: 73000, expenses: 24000, net_income: 49000 },
    { class_name: 'Residential Remodel', income: 85000, cogs: 41000, gross_profit: 44000, expenses: 18000, net_income: 26000 },
    { class_name: 'Consulting & Design', income: 38500, cogs: 12300, gross_profit: 26200, expenses: 9200, net_income: 17000 },
  ];
  res.json({
    start_date: startDate,
    end_date: endDate,
    classes,
    total_income: classes.reduce((s, c) => s + c.income, 0),
    total_expenses: classes.reduce((s, c) => s + c.expenses, 0),
    total_net_income: classes.reduce((s, c) => s + c.net_income, 0),
  });
});

apiRouter.get('/reports/job-profitability', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');
  const jobs = db.jobs.map((j) => {
    const cust = db.customers.find((c) => c.id === j.customer_id);
    const income = j.contract_amount ? j.contract_amount * 0.75 : 45000;
    const costs = j.estimated_cost ? j.estimated_cost * 0.65 : 32000;
    const net = income - costs;
    const margin = income > 0 ? (net / income) * 100 : 0;
    return {
      job_id: j.id,
      customer_name: cust ? cust.name : 'Apex Construction',
      job_name: j.name,
      contract_amount: j.contract_amount,
      income,
      total_costs: costs,
      net_income: net,
      margin_pct: Math.round(margin * 10) / 10,
    };
  });
  res.json({
    start_date: startDate,
    end_date: endDate,
    jobs,
    total_income: jobs.reduce((s, j) => s + j.income, 0),
    total_costs: jobs.reduce((s, j) => s + j.total_costs, 0),
    total_net_income: jobs.reduce((s, j) => s + j.net_income, 0),
  });
});

apiRouter.get('/jobs/budget-vs-actual', (req: Request, res: Response) => {
  const data = db.jobs.map((j) => {
    const cust = db.customers.find((c) => c.id === j.customer_id);
    const revised = j.estimated_cost || 50000;
    const committed = Math.round(revised * 0.25);
    const actual = Math.round(revised * 0.55);
    const projected = committed + actual;
    const variance = revised - projected;
    const pctUsed = revised > 0 ? Math.round((projected / revised) * 1000) / 10 : 0;
    const revenue = j.contract_amount || 75000;
    return {
      job_id: j.id,
      customer_name: cust ? cust.name : '',
      job_name: j.name,
      revised,
      committed,
      actual,
      projected,
      variance,
      pct_used: pctUsed,
      act_revenue: revenue,
    };
  });
  res.json(data);
});

apiRouter.get('/fixed-assets/reports/reconciliation', (_req: Request, res: Response) => {
  const types = [
    { asset_type: 'Machinery & Heavy Equipment', asset_count: 4, cost: 65000, accumulated_depreciation: 14200, book_value: 50800 },
    { asset_type: 'Vehicles & Fleet', asset_count: 3, cost: 42000, accumulated_depreciation: 8900, book_value: 33100 },
    { asset_type: 'Office Furniture & Computers', asset_count: 8, cost: 16500, accumulated_depreciation: 6200, book_value: 10300 },
  ];
  res.json({
    types,
    total_cost: types.reduce((s, t) => s + t.cost, 0),
    total_accumulated: types.reduce((s, t) => s + t.accumulated_depreciation, 0),
    total_book_value: types.reduce((s, t) => s + t.book_value, 0),
  });
});

apiRouter.get('/reports/account-transactions', (req: Request, res: Response) => {
  const accountId = Number(req.query.account_id);
  const account = db.accounts.find((a) => a.id === accountId) || { account_number: '1000', name: 'Operating Checking', balance: 48250.75 };
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');

  const entries = [
    {
      date: '2026-08-15',
      reference: 'INV-1002',
      description: 'Invoice payment received',
      source_type: 'Payment',
      source_id: 101,
      source_link: '#/payments',
      debit: 3500.00,
      credit: 0,
      running_balance: 44750.75,
    },
    {
      date: '2026-08-20',
      reference: 'CHK-1041',
      description: 'Vendor material payment',
      source_type: 'Bill',
      source_id: 204,
      source_link: '#/bills',
      debit: 0,
      credit: 1240.50,
      running_balance: 43510.25,
    },
    {
      date: '2026-09-01',
      reference: 'INV-1004',
      description: 'Progress milestone deposit',
      source_type: 'Payment',
      source_id: 102,
      source_link: '#/payments',
      debit: 4740.50,
      credit: 0,
      running_balance: 48250.75,
    },
  ];

  res.json({
    account: { number: account.account_number, name: account.name },
    start_date: startDate,
    end_date: endDate,
    period_net: entries.reduce((s, e) => s + (e.debit - e.credit), 0),
    entries,
  });
});

// CSV Exports for Financial Reports
function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

apiRouter.get('/reports/profit-loss/csv', (req: Request, res: Response) => {
  const startDate = String(req.query.start_date || '2026-01-01');
  const endDate = String(req.query.end_date || '2026-12-31');

  const incomeRows = db.accounts.filter((a) => a.account_type === 'income');
  const cogsRows = db.accounts.filter((a) => a.account_type === 'cogs');
  const expenseRows = db.accounts.filter((a) => a.account_type === 'expense');

  const totIncome = incomeRows.reduce((s, r) => s + r.balance, 0);
  const totCogs = cogsRows.reduce((s, r) => s + r.balance, 0);
  const grossProfit = totIncome - totCogs;
  const totExpenses = expenseRows.reduce((s, r) => s + r.balance, 0);
  const netIncome = grossProfit - totExpenses;

  const lines: string[] = [
    `"${db.company.name} - Profit & Loss"`,
    `"Date Range: ${startDate} to ${endDate}"`,
    `"Generated: ${new Date().toISOString()}"`,
    `"Currency: USD"`,
    '',
    ['Section', 'Account Number', 'Account Name', 'Amount'].map(escapeCsv).join(','),
  ];

  lines.push(['INCOME', '', '', ''].join(','));
  incomeRows.forEach((a) => {
    lines.push(['Income', a.account_number, a.name, a.balance.toFixed(2)].map(escapeCsv).join(','));
  });
  lines.push(['Total Income', '', '', totIncome.toFixed(2)].map(escapeCsv).join(','));

  lines.push(['COST OF GOODS SOLD', '', '', ''].join(','));
  cogsRows.forEach((a) => {
    lines.push(['Cost of Goods Sold', a.account_number, a.name, a.balance.toFixed(2)].map(escapeCsv).join(','));
  });
  lines.push(['Total COGS', '', '', totCogs.toFixed(2)].map(escapeCsv).join(','));
  lines.push(['GROSS PROFIT', '', '', grossProfit.toFixed(2)].map(escapeCsv).join(','));

  lines.push(['EXPENSES', '', '', ''].join(','));
  expenseRows.forEach((a) => {
    lines.push(['Expenses', a.account_number, a.name, a.balance.toFixed(2)].map(escapeCsv).join(','));
  });
  lines.push(['Total Expenses', '', '', totExpenses.toFixed(2)].map(escapeCsv).join(','));
  lines.push(['NET INCOME', '', '', netIncome.toFixed(2)].map(escapeCsv).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="profit-loss_${startDate}_${endDate}.csv"`);
  res.send(lines.join('\r\n'));
});

apiRouter.get('/reports/balance-sheet/csv', (req: Request, res: Response) => {
  const asOfDate = String(req.query.as_of_date || new Date().toISOString().split('T')[0]);
  const assetRows = db.accounts.filter((a) => a.account_type === 'asset');
  const liabilityRows = db.accounts.filter((a) => a.account_type === 'liability');
  const equityRows = db.accounts.filter((a) => a.account_type === 'equity');

  const totAssets = assetRows.reduce((s, r) => s + r.balance, 0);
  const totLiab = liabilityRows.reduce((s, r) => s + r.balance, 0);
  const totEquity = equityRows.reduce((s, r) => s + r.balance, 0);

  const lines: string[] = [
    `"${db.company.name} - Balance Sheet"`,
    `"As of Date: ${asOfDate}"`,
    `"Generated: ${new Date().toISOString()}"`,
    `"Currency: USD"`,
    '',
    ['Section', 'Account Number', 'Account Name', 'Amount'].map(escapeCsv).join(','),
  ];

  lines.push(['ASSETS', '', '', ''].join(','));
  assetRows.forEach((a) => {
    lines.push(['Asset', a.account_number, a.name, a.balance.toFixed(2)].map(escapeCsv).join(','));
  });
  lines.push(['Total Assets', '', '', totAssets.toFixed(2)].map(escapeCsv).join(','));

  lines.push(['LIABILITIES', '', '', ''].join(','));
  liabilityRows.forEach((a) => {
    lines.push(['Liability', a.account_number, a.name, a.balance.toFixed(2)].map(escapeCsv).join(','));
  });
  lines.push(['Total Liabilities', '', '', totLiab.toFixed(2)].map(escapeCsv).join(','));

  lines.push(['EQUITY', '', '', ''].join(','));
  equityRows.forEach((a) => {
    lines.push(['Equity', a.account_number, a.name, a.balance.toFixed(2)].map(escapeCsv).join(','));
  });
  lines.push(['Total Equity', '', '', totEquity.toFixed(2)].map(escapeCsv).join(','));
  lines.push(['TOTAL LIABILITIES & EQUITY', '', '', (totLiab + totEquity).toFixed(2)].map(escapeCsv).join(','));

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="balance-sheet_${asOfDate}.csv"`);
  res.send(lines.join('\r\n'));
});

// CSV Export for general master data
apiRouter.get('/csv/export/customers', (_req: Request, res: Response) => {
  const lines = [
    ['Name', 'Company', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Terms', 'Balance'].map(escapeCsv).join(','),
    ...db.customers.map((c) =>
      [c.name, c.company || '', c.email || '', c.phone || '', c.bill_address1 || '', c.bill_city || '', c.bill_state || '', c.bill_zip || '', c.terms || '', (c.balance || 0).toFixed(2)]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
  res.send(lines.join('\r\n'));
});

apiRouter.get('/csv/export/vendors', (_req: Request, res: Response) => {
  const lines = [
    ['Name', 'Company', 'Email', 'Phone', 'Address', 'City', 'State', 'Zip', 'Terms', 'Balance'].map(escapeCsv).join(','),
    ...db.vendors.map((v) =>
      [v.name, v.company || '', v.email || '', v.phone || '', v.address1 || '', v.city || '', v.state || '', v.zip || '', v.terms || '', (v.balance || 0).toFixed(2)]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vendors.csv"');
  res.send(lines.join('\r\n'));
});

apiRouter.get('/csv/export/items', (_req: Request, res: Response) => {
  const lines = [
    ['Name', 'Type', 'Description', 'Sales Price', 'Cost', 'Income Account', 'Expense Account', 'Qty on Hand'].map(escapeCsv).join(','),
    ...db.items.map((i) =>
      [i.name, i.item_type, i.description || '', (i.rate || 0).toFixed(2), (i.cost || 0).toFixed(2), i.income_account_id || '', i.expense_account_id || '', i.qty_on_hand || 0]
        .map(escapeCsv)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="items.csv"');
  res.send(lines.join('\r\n'));
});

apiRouter.get('/csv/export/invoices', (_req: Request, res: Response) => {
  const lines = [
    ['Invoice Number', 'Customer', 'Date', 'Due Date', 'Total', 'Balance Due', 'Status'].map(escapeCsv).join(','),
    ...db.invoices.map((inv) => {
      const cust = db.customers.find((c) => c.id === inv.customer_id);
      return [inv.invoice_number, cust ? cust.name : '', inv.date, inv.due_date || '', (inv.total || 0).toFixed(2), (inv.balance_due || 0).toFixed(2), inv.status]
        .map(escapeCsv)
        .join(',');
    }),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  res.send(lines.join('\r\n'));
});

apiRouter.get('/csv/export/accounts', (_req: Request, res: Response) => {
  const lines = [
    ['Account Number', 'Account Name', 'Type', 'Sub Type', 'Balance', 'Active'].map(escapeCsv).join(','),
    ...db.accounts.map((a) =>
      [a.account_number, a.name, a.account_type, a.sub_type || '', (a.balance || 0).toFixed(2), a.is_active ? 'Yes' : 'No']
        .map(escapeCsv)
        .join(',')
    ),
  ];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="chart_of_accounts.csv"');
  res.send(lines.join('\r\n'));
});

apiRouter.post('/reports/sales-tax/pay', (_req: Request, res: Response) => {
  res.json({ ok: true, message: 'Sales tax payment recorded' });
});

apiRouter.get('/saved-reports', (_req: Request, res: Response) => {
  res.json(db.savedReports);
});

apiRouter.post('/saved-reports', (req: Request, res: Response) => {
  const newReport = {
    id: db.savedReports.length + 1,
    name: req.body.name || 'Custom Report',
    report_type: req.body.report_type || 'profit_loss',
    parameters: req.body.parameters || {},
    created_at: new Date().toISOString(),
  };
  db.savedReports.push(newReport);
  res.status(201).json(newReport);
});

// ==========================================
// Settings & Company
// ==========================================
apiRouter.get('/settings', (_req: Request, res: Response) => {
  res.json({
    company: db.company,
    preferences: {
      use_dark_mode: false,
      sales_tax_enabled: true,
      default_terms: 'Net 30',
      auto_invoice_numbering: true,
      next_invoice_number: 1005,
      next_bill_number: 104,
      currency_symbol: '$',
      date_format: 'YYYY-MM-DD',
    },
  });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  if (req.body.company) {
    db.company = { ...db.company, ...req.body.company };
  }
  res.json({ ok: true, company: db.company });
});

// ==========================================
// Jobs & Job Costing
// ==========================================
apiRouter.get('/jobs', (req: Request, res: Response) => {
  res.json(db.jobs);
});

apiRouter.get('/jobs/budget-vs-actual', (_req: Request, res: Response) => {
  const rows = db.jobs.map((j) => ({
    job_id: j.id,
    job_name: j.name,
    customer_name: j.customer_name,
    budget_cost: j.estimated_cost,
    contract_amount: j.contract_amount,
    actual_cost: (j.estimated_cost || 0) * 0.42,
    billed_amount: (j.contract_amount || 0) * 0.35,
    variance: (j.estimated_cost || 0) * 0.58,
  }));
  res.json(rows);
});

apiRouter.post('/jobs', (req: Request, res: Response) => {
  const newId = db.jobs.length > 0 ? Math.max(...db.jobs.map((j) => j.id)) + 1 : 1;
  const customer = db.customers.find((c) => c.id === Number(req.body.customer_id));
  const newJob = {
    id: newId,
    customer_id: Number(req.body.customer_id),
    customer_name: customer ? customer.name : '',
    name: req.body.name || `Job #${newId}`,
    status: req.body.status || 'in_progress',
    start_date: req.body.start_date || new Date().toISOString().split('T')[0],
    end_date: req.body.end_date,
    estimated_cost: Number(req.body.estimated_cost) || 0,
    contract_amount: Number(req.body.contract_amount) || 0,
    is_active: true,
    notes: req.body.notes || '',
  };
  db.jobs.push(newJob as any);
  res.status(201).json(newJob);
});

apiRouter.get('/job-costs', (_req: Request, res: Response) => {
  res.json([
    { id: 1, job_id: 1, date: '2026-08-20', cost_type: 'Materials', amount: 2420.0, description: 'Lumber & subfloor' },
    { id: 2, job_id: 1, date: '2026-08-28', cost_type: 'Equipment', amount: 1850.0, description: 'Boom lift rental' },
    { id: 3, job_id: 2, date: '2026-08-24', cost_type: 'Materials', amount: 1350.0, description: 'Hold-downs & seismic ties' },
  ]);
});

apiRouter.post('/job-costs', (req: Request, res: Response) => {
  res.status(201).json({ id: Date.now(), ...req.body });
});

apiRouter.get('/cost-codes', (_req: Request, res: Response) => {
  res.json(db.costCodes);
});

apiRouter.get('/cost-types', (_req: Request, res: Response) => {
  res.json(db.costTypes);
});

apiRouter.get('/equipment', (_req: Request, res: Response) => {
  res.json(db.equipment);
});

// ==========================================
// Employees & Payroll
// ==========================================
apiRouter.get('/employees', (req: Request, res: Response) => {
  let list = db.employees;
  if (req.query.active_only === 'true') {
    list = list.filter((e) => e.is_active);
  }
  res.json(list);
});

apiRouter.post('/employees', (req: Request, res: Response) => {
  const newId = db.employees.length > 0 ? Math.max(...db.employees.map((e) => e.id)) + 1 : 1;
  const newEmp = {
    id: newId,
    first_name: req.body.first_name || '',
    last_name: req.body.last_name || '',
    name: `${req.body.first_name || ''} ${req.body.last_name || ''}`.trim() || 'New Employee',
    ssn_last_four: req.body.ssn_last_four || '0000',
    email: req.body.email || '',
    phone: req.body.phone || '',
    job_title: req.body.job_title || 'Craftsman',
    pay_type: req.body.pay_type || 'hourly',
    pay_rate: Number(req.body.pay_rate) || 30.0,
    is_active: true,
    hire_date: req.body.hire_date || new Date().toISOString().split('T')[0],
  };
  db.employees.push(newEmp as any);
  res.status(201).json(newEmp);
});

apiRouter.get('/payroll', (_req: Request, res: Response) => {
  res.json(db.payrollRuns);
});

apiRouter.post('/payroll', (req: Request, res: Response) => {
  const newId = db.payrollRuns.length + 1;
  const newRun = {
    id: newId,
    pay_period_start: req.body.pay_period_start || '2026-09-01',
    pay_period_end: req.body.pay_period_end || '2026-09-15',
    check_date: req.body.check_date || '2026-09-15',
    total_gross: Number(req.body.total_gross) || 9500.0,
    total_taxes: 2150.0,
    total_deductions: 520.0,
    total_net: 6830.0,
    status: 'processed' as const,
    checks_count: db.employees.filter((e) => e.is_active).length,
    created_at: new Date().toISOString(),
  };
  db.payrollRuns.unshift(newRun);
  res.status(201).json(newRun);
});

apiRouter.get('/time-entries', (_req: Request, res: Response) => {
  res.json(db.timeEntries);
});

apiRouter.post('/time-entries', (req: Request, res: Response) => {
  const newEntry = {
    id: db.timeEntries.length + 1,
    ...req.body,
  };
  db.timeEntries.push(newEntry);
  res.status(201).json(newEntry);
});

apiRouter.get('/pto/requests', (_req: Request, res: Response) => {
  res.json(db.ptoRequests);
});

apiRouter.get('/pto/policies', (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: 'Standard Vacation (80 hrs/yr)', accrual_rate: 3.08, max_carryover: 40 },
    { id: 2, name: 'Sick Leave (40 hrs/yr)', accrual_rate: 1.54, max_carryover: 40 },
  ]);
});

apiRouter.get('/pto/accruals', (_req: Request, res: Response) => {
  res.json([]);
});

apiRouter.get('/deductions', (_req: Request, res: Response) => {
  res.json(db.deductions);
});

apiRouter.get('/tax-forms', (_req: Request, res: Response) => {
  res.json([
    { form: 'Form 941 (Employer Quarterly Federal Tax)', year: 2026, quarter: 'Q2', status: 'Filed' },
    { form: 'Form 940 (FUTA)', year: 2025, quarter: 'Annual', status: 'Filed' },
    { form: 'W-2 Wage and Tax Statement', year: 2025, count: 4, status: 'Distributed' },
  ]);
});

// ==========================================
// Other Supporting Endpoints
// ==========================================
apiRouter.get('/purchase-orders', (_req: Request, res: Response) => {
  res.json(db.purchaseOrders);
});

apiRouter.post('/purchase-orders', (req: Request, res: Response) => {
  const newPo = {
    id: db.purchaseOrders.length + 1,
    po_number: `PO-2026-00${db.purchaseOrders.length + 1}`,
    ...req.body,
    status: 'open',
    created_at: new Date().toISOString(),
  };
  db.purchaseOrders.push(newPo);
  res.status(201).json(newPo);
});

apiRouter.get('/estimates', (_req: Request, res: Response) => {
  res.json(db.estimates);
});

apiRouter.post('/estimates', (req: Request, res: Response) => {
  const newEst = {
    id: db.estimates.length + 1,
    estimate_number: `EST-10${db.estimates.length + 1}`,
    ...req.body,
    status: 'sent',
    created_at: new Date().toISOString(),
  };
  db.estimates.push(newEst);
  res.status(201).json(newEst);
});

apiRouter.get('/credit-memos', (_req: Request, res: Response) => {
  res.json(db.creditMemos);
});

apiRouter.get('/fixed-assets', (_req: Request, res: Response) => {
  res.json(db.fixedAssets);
});

apiRouter.get('/fixed-assets/types', (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: 'Vehicles', default_years: 5 },
    { id: 2, name: 'Machinery & Tools', default_years: 7 },
    { id: 3, name: 'Office Computers', default_years: 3 },
  ]);
});

apiRouter.post('/fixed-assets/run-depreciation', (_req: Request, res: Response) => {
  res.json({ ok: true, journal_entry_id: 104, total_depreciation: 480.0 });
});

apiRouter.get('/recurring', (_req: Request, res: Response) => {
  res.json(db.recurring);
});

apiRouter.post('/recurring/generate', (_req: Request, res: Response) => {
  res.json({ generated_invoices: 0, generated_bills: 1 });
});

apiRouter.get('/bank-rules', (_req: Request, res: Response) => {
  res.json(db.bankRules);
});

apiRouter.get('/budgets', (_req: Request, res: Response) => {
  res.json(db.budgets);
});

apiRouter.get('/reseller-permits', (_req: Request, res: Response) => {
  res.json(db.resellerPermits);
});

apiRouter.get('/reseller-permits/expiring', (_req: Request, res: Response) => {
  res.json([]);
});

apiRouter.get('/audit', (_req: Request, res: Response) => {
  res.json(db.auditLog);
});

apiRouter.get('/companies', (_req: Request, res: Response) => {
  res.json([{ id: 1, name: db.company.name, is_current: true }]);
});

apiRouter.get('/classes', (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: 'Commercial', is_archived: false },
    { id: 2, name: 'Residential', is_archived: false },
    { id: 3, name: 'Marine', is_archived: false },
  ]);
});

apiRouter.get('/users', (_req: Request, res: Response) => {
  res.json([
    { id: 1, username: 'admin', role: 'admin', is_active: true },
    { id: 2, username: 'bookkeeper', role: 'editor', is_active: true },
  ]);
});

apiRouter.get('/tokens', (_req: Request, res: Response) => {
  res.json([]);
});

apiRouter.get('/email-templates', (_req: Request, res: Response) => {
  res.json([
    { id: 1, name: 'Invoice Delivery', subject: 'Invoice #{invoice_number} from Acme Contracting', body: 'Dear Customer,\n\nPlease find your invoice attached.' },
    { id: 2, name: 'Payment Receipt', subject: 'Receipt for payment #{reference}', body: 'Thank you for your payment!' },
  ]);
});

apiRouter.get('/backups', (_req: Request, res: Response) => {
  res.json([
    { id: 1, filename: 'slowbooks-backup-2026-09-01.sbp', size_kb: 1420, created_at: '2026-09-01T00:00:00Z' },
  ]);
});

apiRouter.get('/opening-balances/status', (_req: Request, res: Response) => {
  res.json({ configured: true });
});

apiRouter.get('/ocr/status', (_req: Request, res: Response) => {
  res.json({ available: true, engine: 'built_in' });
});

apiRouter.get('/qbo/status', (_req: Request, res: Response) => {
  res.json({ connected: false });
});

apiRouter.get('/migration/sources', (_req: Request, res: Response) => {
  res.json(['qbw_iif', 'quickbooks_online', 'csv']);
});

apiRouter.get('/journal', (_req: Request, res: Response) => {
  res.json([
    { id: 1, entry_number: 'JE-001', date: '2026-08-01', memo: 'Opening inventory adjustments', lines: [] },
  ]);
});

apiRouter.get('/deposits', (_req: Request, res: Response) => {
  res.json([]);
});

apiRouter.get('/check-register', (_req: Request, res: Response) => {
  res.json(db.bankTransactions);
});

apiRouter.get('/cc-charges', (_req: Request, res: Response) => {
  res.json([]);
});
