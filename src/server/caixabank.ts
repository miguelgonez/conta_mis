import { Request, Response } from 'express';
import { db } from './data.js';

export interface Norma43Transaction {
  date: string;
  value_date: string;
  payee: string;
  description: string;
  common_concept: string;
  own_concept: string;
  debit: number;
  credit: number;
  amount: number; // positive for credit, negative for debit
  document_number: string;
  reference: string;
  complementary_lines: string[];
}

export interface Norma43Statement {
  bank_code: string;
  bank_name: string;
  branch_code: string;
  account_number: string;
  iban: string;
  start_date: string;
  end_date: string;
  initial_balance: number;
  final_balance: number;
  currency: string;
  debit_count: number;
  debit_total: number;
  credit_count: number;
  credit_total: number;
  transactions: Norma43Transaction[];
}

// Compute Spanish IBAN check digits for entity, branch, DC, and account
export function calculateSpanishIban(entity: string, branch: string, dc: string, account: string): string {
  const ccc = `${entity.padStart(4, '0')}${branch.padStart(4, '0')}${dc.padStart(2, '0')}${account.padStart(10, '0')}`;
  // Mod 97 on ES00 (ES = 1428, 00) -> ccc + 142800
  const numericStr = `${ccc}142800`;
  let remainder = 0;
  for (let i = 0; i < numericStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numericStr[i], 10)) % 97;
  }
  const checkDigits = (98 - remainder).toString().padStart(2, '0');
  return `ES${checkDigits}${ccc}`;
}

// Helper to parse dates from Norma 43 (format YYMMDD)
export function parseN43Date(yymmdd: string): string {
  if (!yymmdd || yymmdd.length < 6) return new Date().toISOString().split('T')[0];
  const year = parseInt(yymmdd.substring(0, 2), 10);
  const month = yymmdd.substring(2, 4);
  const day = yymmdd.substring(4, 6);
  // Assume 2000s for YY < 80, 1900s otherwise
  const fullYear = year < 80 ? 2000 + year : 1900 + year;
  return `${fullYear}-${month}-${day}`;
}

// Standard AEB Spanish concept dictionary
export const AEB_CONCEPTS: Record<string, string> = {
  '01': 'Transferencia / Traspaso',
  '02': 'Cheque / Pagaré',
  '03': 'Recibo / Efecto comercial domiciliado',
  '04': 'Comisión bancaria / Gastos de gestión',
  '05': 'Intereses / Liquidación de cuenta',
  '06': 'Tributos / Seguros Sociales / AEAT',
  '07': 'Cajero / Disposición en efectivo',
  '08': 'Abono en efectivo / Ventanilla',
  '09': 'Operación tarjeta / TPV Comercio',
  '10': 'Préstamo / Cuota amortización',
  '11': 'Operación bursátil / Valores',
  '99': 'Operación genérica / Varios',
};

// Parser for AEB Norma 43 (CSB 43) files
export function parseNorma43(rawContent: string): Norma43Statement[] {
  const lines = rawContent.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length >= 2);
  const statements: Norma43Statement[] = [];

  let currentStmt: Norma43Statement | null = null;
  let currentTxn: Norma43Transaction | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const recordType = line.substring(0, 2);

    if (recordType === '11') {
      // Record 11: Header record
      const bankCode = line.substring(2, 6).trim();
      const branchCode = line.substring(6, 10).trim();
      const accountNum = line.substring(10, 20).trim();
      const startDate = parseN43Date(line.substring(20, 26));
      const endDate = parseN43Date(line.substring(26, 32));
      const signCode = line.substring(32, 33); // 1 = debtor (negative), 2 = creditor (positive)
      const balanceCents = parseInt(line.substring(33, 47) || '0', 10);
      const balance = (balanceCents / 100) * (signCode === '1' ? -1 : 1);
      const currencyCode = line.substring(47, 50).trim() || 'EUR';

      // Default DC calculation or dummy 00
      const iban = calculateSpanishIban(bankCode, branchCode, '00', accountNum);
      const bankName = bankCode === '2100' ? 'CaixaBank' : (bankCode === '0049' ? 'Banco Santander' : (bankCode === '0182' ? 'BBVA' : `Banco (${bankCode})`));

      currentStmt = {
        bank_code: bankCode,
        bank_name: bankName,
        branch_code: branchCode,
        account_number: accountNum,
        iban,
        start_date: startDate,
        end_date: endDate,
        initial_balance: isNaN(balance) ? 0 : balance,
        final_balance: 0,
        currency: currencyCode === '978' ? 'EUR' : currencyCode,
        debit_count: 0,
        debit_total: 0,
        credit_count: 0,
        credit_total: 0,
        transactions: [],
      };
      statements.push(currentStmt);
    } else if (recordType === '23' && currentStmt) {
      // Record 23: Principal transaction movement
      if (currentTxn) {
        currentStmt.transactions.push(currentTxn);
        currentTxn = null;
      }

      const opDate = parseN43Date(line.substring(10, 16));
      const valDate = parseN43Date(line.substring(16, 22));
      const commonCode = line.substring(22, 24).trim();
      const ownCode = line.substring(24, 27).trim();
      const signCode = line.substring(27, 28); // 1 = debtor (cargo / debit), 2 = creditor (abono / credit)
      const amountCents = parseInt(line.substring(28, 42) || '0', 10);
      const amount = amountCents / 100;
      const docNum = line.substring(42, 52).trim();
      const ref1 = line.substring(52, 64).trim();
      const ref2 = line.length > 64 ? line.substring(64, 80).trim() : '';

      const isDebit = signCode === '1';
      const debit = isDebit ? amount : 0;
      const credit = !isDebit ? amount : 0;
      const netAmount = isDebit ? -amount : amount;

      const commonName = AEB_CONCEPTS[commonCode] || 'Movimiento bancario';
      const fullRef = [ref1, ref2].filter(Boolean).join(' - ');

      currentTxn = {
        date: opDate,
        value_date: valDate,
        payee: fullRef || commonName,
        description: commonName,
        common_concept: commonCode,
        own_concept: ownCode,
        debit,
        credit,
        amount: netAmount,
        document_number: docNum,
        reference: fullRef,
        complementary_lines: [],
      };
    } else if (recordType === '24' && currentTxn) {
      // Record 24: Complementary line items
      const line1 = line.substring(4, 42).trim();
      const line2 = line.length > 42 ? line.substring(42, 80).trim() : '';
      const text = [line1, line2].filter(Boolean).join(' ');
      if (text) {
        currentTxn.complementary_lines.push(text);
        // Enrich description and payee if available
        if (currentTxn.description === 'Movimiento bancario' || currentTxn.description.length < 10) {
          currentTxn.description = text;
        }
        if (!currentTxn.payee || currentTxn.payee === currentTxn.reference) {
          currentTxn.payee = text;
        }
      }
    } else if (recordType === '33' && currentStmt) {
      // Record 33: End of account statement
      if (currentTxn) {
        currentStmt.transactions.push(currentTxn);
        currentTxn = null;
      }
      currentStmt.debit_count = parseInt(line.substring(20, 25) || '0', 10);
      currentStmt.debit_total = parseInt(line.substring(25, 39) || '0', 10) / 100;
      currentStmt.credit_count = parseInt(line.substring(39, 44) || '0', 10);
      currentStmt.credit_total = parseInt(line.substring(44, 58) || '0', 10) / 100;
      const finalSign = line.substring(58, 59);
      const finalCents = parseInt(line.substring(59, 73) || '0', 10);
      currentStmt.final_balance = (finalCents / 100) * (finalSign === '1' ? -1 : 1);
    }
  }

  if (currentTxn && currentStmt && !currentStmt.transactions.includes(currentTxn)) {
    currentStmt.transactions.push(currentTxn);
  }

  return statements;
}

// Parser for CaixaBank CSV extracts
export function parseCaixaBankCsv(csvContent: string): Norma43Transaction[] {
  const lines = csvContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect delimiter (; or , or \t)
  const header = lines[0];
  let delimiter = ';';
  if (header.split(';').length > 2) delimiter = ';';
  else if (header.split('\t').length > 2) delimiter = '\t';
  else if (header.split(',').length > 2) delimiter = ',';

  const rows = lines.slice(1);
  const txs: Norma43Transaction[] = [];

  for (const row of rows) {
    const parts = row.split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());
    if (parts.length < 3) continue;

    // Common CaixaBank CSV layouts:
    // Layout 1: Fecha | Concepto | Importe | Saldo | Fecha valor | Referencia
    // Layout 2: Fecha operación | Fecha valor | Concepto | Importe | Saldo
    let dateStr = parts[0];
    let concept = parts[1] || '';
    let amountStr = parts[2] || '';
    let ref = parts[4] || parts[5] || '';

    // Check if second column is also a date (Fecha valor)
    if (/^\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}$/.test(parts[1])) {
      concept = parts[2] || '';
      amountStr = parts[3] || '';
      ref = parts[5] || '';
    }

    // Parse DD/MM/YYYY to YYYY-MM-DD
    const dateMatch = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    let isoDate = dateStr;
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      let yr = dateMatch[3];
      if (yr.length === 2) yr = '20' + yr;
      isoDate = `${yr}-${month}-${day}`;
    }

    // Clean Spanish amount: "1.250,50 €" or "-45,00"
    let cleanAmt = amountStr.replace(/[€$\s]/g, '');
    if (cleanAmt.includes(',') && cleanAmt.includes('.')) {
      cleanAmt = cleanAmt.replace(/\./g, '').replace(',', '.');
    } else if (cleanAmt.includes(',')) {
      cleanAmt = cleanAmt.replace(',', '.');
    }
    const numAmt = parseFloat(cleanAmt);
    if (isNaN(numAmt)) continue;

    const debit = numAmt < 0 ? Math.abs(numAmt) : 0;
    const credit = numAmt > 0 ? numAmt : 0;

    txs.push({
      date: isoDate,
      value_date: isoDate,
      payee: concept,
      description: concept,
      common_concept: '99',
      own_concept: '',
      debit,
      credit,
      amount: numAmt,
      document_number: '',
      reference: ref,
      complementary_lines: [],
    });
  }

  return txs;
}

// Generate realistic CaixaBank Norma 43 sample file for live demonstration
export function generateSampleNorma43(): string {
  // CaixaBank entity code is 2100, Branch 0001 (Diagonal Barcelona headquarters)
  const entity = '2100';
  const branch = '0001';
  const account = '0200194821';
  const today = new Date();
  const yymmddToday = today.toISOString().slice(2, 10).replace(/-/g, '');
  const prevMonth = new Date(today.getTime() - 30 * 86400000);
  const yymmddStart = prevMonth.toISOString().slice(2, 10).replace(/-/g, '');

  const formatAmount = (euros: number) => {
    const cents = Math.round(Math.abs(euros) * 100);
    return cents.toString().padStart(14, '0');
  };

  const initialBalance = 42580.40;
  // Records:
  // 11 Cabecera
  const r11 = `11${entity}${branch}${account}${yymmddStart}${yymmddToday}2${formatAmount(initialBalance)}97801SLOWBOOKS PRO SL            `;

  // Sample transactions
  const sampleItems = [
    {
      dayOffset: 25,
      common: '01',
      own: '101',
      sign: '2', // credit
      amount: 4500.00,
      doc: '0000918273',
      ref1: 'TRANSF INMOBILIARIA APEX',
      c24_1: 'TRANSFERENCIA SEPA DE APEX COMMERCIAL SL',
      c24_2: 'FAC 2026-104 PAGADA POR CAIXABANKNOW',
    },
    {
      dayOffset: 22,
      common: '09',
      own: '202',
      sign: '2', // credit
      amount: 1285.50,
      doc: '0000918274',
      ref1: 'LIQ TPV CAIXABANK',
      c24_1: 'LIQUIDACION TPV VIRTUAL CAIXABANK REDSYS',
      c24_2: 'TERMINAL 492019 COMERCIO DIA ANTERIOR',
    },
    {
      dayOffset: 18,
      common: '06',
      own: '305',
      sign: '1', // debit
      amount: 685.20,
      doc: '0000918275',
      ref1: 'TGSS SEGUROS SOCIALES',
      c24_1: 'TESORERIA GENERAL SEGURIDAD SOCIAL',
      c24_2: 'RECIBO SEPA AUTONOMO Y COTIZACIONES TRAB.',
    },
    {
      dayOffset: 15,
      common: '03',
      own: '401',
      sign: '1', // debit
      amount: 1450.00,
      doc: '0000918276',
      ref1: 'ARRENDAMIENTOS PARK SL',
      c24_1: 'RECIBO DOMICILIADO ALQUILER NAVE Y OFICINA',
      c24_2: 'MENSUALIDAD LOCAL COMERCIAL MES EN CURSO',
    },
    {
      dayOffset: 10,
      common: '01',
      own: '102',
      sign: '1', // debit
      amount: 2850.00,
      doc: '0000918277',
      ref1: 'NOMINAS SEPTIEMBRE',
      c24_1: 'PAGO DE NOMINA REMESA SEPA CAIXABANKNOW',
      c24_2: 'TRANSFERENCIA A TRABAJADORES EN PLANTILLA',
    },
    {
      dayOffset: 5,
      common: '09',
      own: '205',
      sign: '1', // debit
      amount: 142.30,
      doc: '0000918278',
      ref1: 'VISA NEGOCIOS CAIXABANK',
      c24_1: 'PAGO TARJETA VISA EMPRESA CAIXABANK',
      c24_2: 'COMPRA GASOLINA REPSOL Y SUMINISTROS OFI',
    },
    {
      dayOffset: 2,
      common: '04',
      own: '501',
      sign: '1', // debit
      amount: 18.50,
      doc: '0000918279',
      ref1: 'COMISION CAIXABANK',
      c24_1: 'COMISION MANTENIMIENTO CUENTA Y TPV',
      c24_2: 'LIQUIDACION MENSUAL SERVICIOS BANCARIOS',
    },
  ];

  let movementsLines: string[] = [];
  let totalDebits = 0;
  let countDebits = 0;
  let totalCredits = 0;
  let countCredits = 0;

  for (const item of sampleItems) {
    const txDate = new Date(today.getTime() - item.dayOffset * 86400000);
    const yymmddTx = txDate.toISOString().slice(2, 10).replace(/-/g, '');
    const amtStr = formatAmount(item.amount);

    if (item.sign === '1') {
      totalDebits += item.amount;
      countDebits++;
    } else {
      totalCredits += item.amount;
      countCredits++;
    }

    const r23 = `23${branch}0000${yymmddTx}${yymmddTx}${item.common}${item.own}${item.sign}${amtStr}${item.doc.padEnd(10, '0')}${item.ref1.padEnd(12, ' ').slice(0, 12)}${item.ref1.slice(12).padEnd(16, ' ')}`;
    const r24_1 = `2401${item.c24_1.padEnd(38, ' ').slice(0, 38)}${(item.c24_2 || '').padEnd(38, ' ').slice(0, 38)}`;
    movementsLines.push(r23);
    movementsLines.push(r24_1);
  }

  const finalBalance = initialBalance + totalCredits - totalDebits;
  const countDebitsStr = countDebits.toString().padStart(5, '0');
  const countCreditsStr = countCredits.toString().padStart(5, '0');
  const r33 = `33${entity}${branch}${account}${countDebitsStr}${formatAmount(totalDebits)}${countCreditsStr}${formatAmount(totalCredits)}2${formatAmount(finalBalance)}978`;
  const totalRecords = (3 + movementsLines.length + 1).toString().padStart(6, '0');
  const r88 = `889999999999999999${totalRecords}`.padEnd(80, ' ');

  return [r11, ...movementsLines, r33, r88].join('\r\n');
}

// Open Banking / PSD2 configuration state
export interface OpenBankingConfig {
  provider: 'caixabank_direct' | 'gocardless_nordigen' | 'redsys_hub';
  client_id?: string;
  client_secret?: string;
  setup_token?: string;
  requisition_id?: string;
  account_iban?: string;
  is_connected: boolean;
  last_sync?: string;
  environment: 'production' | 'sandbox';
}

export const caixabankState: { config: OpenBankingConfig } = {
  config: {
    provider: 'gocardless_nordigen',
    is_connected: false,
    environment: 'production',
  },
};

// Generate SEPA XML pain.001.001.03 for CaixaBank
export function generateSepaPain001Xml(payments: Array<{ creditor_name: string; iban: string; amount: number; concept: string }>): string {
  const msgId = `SLOWBOOKS-${Date.now()}`;
  const creationDate = new Date().toISOString().replace(/\.\d{3}Z$/, '');
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2);
  const numTx = payments.length;

  const paymentTxs = payments
    .map(
      (p, idx) => `
    <PmtInf>
      <PmtInfId>PMT-CAIXA-${idx + 1}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${p.amount.toFixed(2)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${new Date().toISOString().split('T')[0]}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(db.company.name)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>ES21210000010200194821</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>CAIXESBBXXX</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>E2E-${Date.now()}-${idx + 1}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${p.amount.toFixed(2)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BICFI>CAIXESBBXXX</BICFI>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(p.creditor_name)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${p.iban.replace(/\s+/g, '').toUpperCase()}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(p.concept || 'PAGO FACTURA')}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>
    </PmtInf>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creationDate}</CreDtTm>
      <NbOfTxs>${numTx}</NbOfTxs>
      <CtrlSum>${totalAmount}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(db.company.name)}</Nm>
        <Id>
          <OrgId>
            <Othr>
              <Id>${escapeXml(db.company.tax_id || 'B12345678')}</Id>
            </Othr>
          </OrgId>
        </Id>
      </InitgPty>
    </GrpHdr>
    ${paymentTxs}
  </CstmrCdtTrfInitn>
</Document>`;
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
