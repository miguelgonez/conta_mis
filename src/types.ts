export interface Customer {
  id: number;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  bill_address1?: string;
  bill_address2?: string;
  bill_city?: string;
  bill_state?: string;
  bill_zip?: string;
  bill_country?: string;
  ship_address1?: string;
  ship_address2?: string;
  ship_city?: string;
  ship_state?: string;
  ship_zip?: string;
  ship_country?: string;
  terms: string;
  credit_limit?: number;
  tax_id?: string;
  is_taxable: boolean;
  notes?: string;
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface InvoiceLine {
  id: number;
  item_id?: number;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
  class_name?: string;
  job_id?: number;
  class_id?: number;
  cost_code_id?: number;
  line_order: number;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  customer_id: number;
  customer_name?: string;
  date: string;
  due_date?: string;
  terms: string;
  po_number?: string;
  memo?: string;
  bill_address1?: string;
  bill_address2?: string;
  bill_city?: string;
  bill_state?: string;
  bill_zip?: string;
  ship_address1?: string;
  ship_address2?: string;
  ship_city?: string;
  ship_state?: string;
  ship_zip?: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  balance_due: number;
  status: 'draft' | 'sent' | 'paid' | 'partial' | 'void';
  is_sales_receipt: boolean;
  lines: InvoiceLine[];
  created_at: string;
}

export interface Payment {
  id: number;
  customer_id: number;
  customer_name?: string;
  invoice_id?: number;
  invoice_number?: string;
  date: string;
  amount: number;
  payment_method?: string;
  method?: string;
  reference?: string;
  deposit_to_account_id?: number;
  memo?: string;
  created_at: string;
}

export interface Vendor {
  id: number;
  name: string;
  company?: string;
  contact?: string;
  phone?: string;
  email?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  tax_id?: string;
  is_1099: boolean;
  terms: string;
  account_number?: string;
  expense_account_id?: number;
  balance: number;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

export interface BillLine {
  id: number;
  item_id?: number;
  account_id?: number;
  description?: string;
  quantity: number;
  rate: number;
  amount: number;
  class_name?: string;
  job_id?: number;
  cost_code_id?: number;
}

export interface Bill {
  id: number;
  vendor_id: number;
  vendor_name?: string;
  bill_number?: string;
  date: string;
  due_date: string;
  terms: string;
  memo?: string;
  total: number;
  balance_due: number;
  status: 'unpaid' | 'paid' | 'partial' | 'void';
  lines: BillLine[];
  created_at: string;
}

export interface Item {
  id: number;
  name: string;
  item_type: 'service' | 'inventory' | 'non_inventory' | 'other_charge' | 'subtotal' | 'group' | 'discount';
  description?: string;
  rate: number;
  cost?: number;
  income_account_id?: number;
  expense_account_id?: number;
  asset_account_id?: number;
  qty_on_hand?: number;
  is_taxable: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Account {
  id: number;
  account_number: string;
  name: string;
  account_type: 'asset' | 'liability' | 'equity' | 'income' | 'cogs' | 'expense';
  sub_type?: string;
  description?: string;
  balance: number;
  is_active: boolean;
}

export interface BankAccount {
  id: number;
  name: string;
  account_id?: number;
  bank_name?: string;
  routing_number?: string;
  account_number?: string;
  last_four?: string;
  balance: number;
  is_active: boolean;
}

export interface BankTransaction {
  id: number;
  bank_account_id: number;
  date: string;
  payee?: string;
  check_number?: string;
  memo?: string;
  debit: number;
  credit: number;
  balance: number;
  is_reconciled: boolean;
}

export interface Job {
  id: number;
  customer_id: number;
  customer_name?: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'closed';
  start_date?: string;
  end_date?: string;
  projected_end?: string;
  estimated_cost?: number;
  contract_amount?: number;
  is_active: boolean;
  notes?: string;
}

export interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  name: string;
  ssn_last_four?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  job_title?: string;
  pay_type: 'hourly' | 'salary';
  pay_rate: number;
  is_active: boolean;
  hire_date?: string;
}

export interface PayrollRun {
  id: number;
  pay_period_start: string;
  pay_period_end: string;
  check_date: string;
  total_gross: number;
  total_taxes: number;
  total_deductions: number;
  total_net: number;
  status: 'draft' | 'processed';
  checks_count: number;
  created_at: string;
}
