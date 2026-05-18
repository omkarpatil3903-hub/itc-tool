import { useState, useMemo, useRef } from "react";
import Papa from "papaparse";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Upload, BarChart2, FileText, CheckCircle, AlertTriangle, XCircle,
  AlertCircle, Download, RefreshCw, Search, Zap, Copy, Users,
  ClipboardList, Shield, ThumbsUp, ThumbsDown, Calendar, Info, Edit3,
  ChevronDown, ChevronRight
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
const MONTH_MAP = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

function normalizeDate(v) {
  if (!v && v !== 0) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m;
  if (/^\d{5,6}$/.test(s)) {
    const n = parseInt(s,10);
    if (n>40000&&n<60000) return new Date((n-25569)*86400000).toISOString().slice(0,10);
  }
  if ((m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)))
    return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  if ((m=s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)))
    return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  if ((m=s.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/))) {
    let y=parseInt(m[3],10); if(y<100)y+=2000;
    return `${y}-${String(MONTH_MAP[m[2].toLowerCase()]||1).padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  }
  const p=new Date(s); return isNaN(p)?null:p.toISOString().slice(0,10);
}
function normalizeInv(s){ return String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"").replace(/^0+/,""); }
function levenshtein(a,b){
  const dp=[...Array(b.length+1)].map((_,j)=>j);
  for(let i=1;i<=a.length;i++){
    let prev=i;
    for(let j=1;j<=b.length;j++){const tmp=dp[j];dp[j]=a[i-1]===b[j-1]?dp[j-1]:1+Math.min(dp[j-1],dp[j],prev);prev=tmp;}
  }
  return dp[b.length];
}
function similarity(a,b){
  const na=normalizeInv(a),nb=normalizeInv(b);
  if(na===nb)return 100; if(!na||!nb)return 0;
  return Math.round((1-levenshtein(na,nb)/Math.max(na.length,nb.length))*100);
}
function dateDiffDays(a,b){ if(!a||!b)return 999; return Math.abs(new Date(a)-new Date(b))/86400000; }
function parseNum(v){ return parseFloat(String(v||0).replace(/,/g,""))||0; }
function inrFmt(n,compact=false){
  if(compact){
    if(Math.abs(n)>=1e7)return"₹"+(n/1e7).toFixed(2)+"Cr";
    if(Math.abs(n)>=1e5)return"₹"+(n/1e5).toFixed(1)+"L";
    if(Math.abs(n)>=1e3)return"₹"+(n/1e3).toFixed(1)+"K";
    return"₹"+Math.round(n);
  }
  return"₹"+new Intl.NumberFormat("en-IN",{maximumFractionDigits:0}).format(n||0);
}
function validateGSTIN(g){ return /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(g||"").trim().toUpperCase()); }
function getState(g){
  const MAP={"01":"J&K","02":"HP","03":"Punjab","04":"Chandigarh","05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"UP","10":"Bihar","11":"Sikkim","12":"Arunachal","13":"Nagaland","14":"Manipur","15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal","20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"MP","24":"Gujarat","27":"Maharashtra","29":"Karnataka","30":"Goa","32":"Kerala","33":"Tamil Nadu","36":"Telangana","37":"AP"};
  return MAP[String(g||"").slice(0,2)]||`State ${String(g||"").slice(0,2)}`;
}

function mapRow(raw){
  const r=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k.toLowerCase().replace(/[\s/-]/g,"_").replace(/[^a-z0-9_]/g,""),String(v||"").trim()]));
  return{
    gstin:r.gstin||r.supplier_gstin||r.vendor_gstin||r.party_gstin||r.counterparty_gstin||r.gst_no||"",
    invoice_no:r.invoice_no||r.invoice_number||r.inv_no||r.invoice||r.doc_no||r.bill_no||r.document_no||r.voucher_no||"",
    invoice_date:r.invoice_date||r.date||r.doc_date||r.inv_date||r.bill_date||r.voucher_date||"",
    taxable_value:parseNum(r.taxable_value||r.taxable||r.assessable_value||r.base_amount||r.net_amount||r.taxable_amount||0),
    cgst:parseNum(r.cgst||r.cgst_amount||r.central_gst||0),
    sgst:parseNum(r.sgst||r.sgst_amount||r.state_gst||r.utgst||0),
    igst:parseNum(r.igst||r.igst_amount||r.integrated_gst||0),
    supplier_name:r.supplier_name||r.vendor_name||r.party_name||r.name||"",
  };
}

function groupEntries(rows){
  const mp=new Map();
  for(const r of rows){
    const nd=normalizeDate(r.invoice_date)||String(r.invoice_date||"");
    const key=`${String(r.gstin||"").toUpperCase().trim()}|||${normalizeInv(r.invoice_no)}|||${nd}`;
    if(!mp.has(key))mp.set(key,{...r,_nd:nd,_cnt:1,_parts:[{taxable_value:r.taxable_value,cgst:r.cgst,sgst:r.sgst,igst:r.igst}]});
    else{const g=mp.get(key);g.taxable_value+=r.taxable_value;g.cgst+=r.cgst;g.sgst+=r.sgst;g.igst+=r.igst;g._cnt++;g._parts.push({taxable_value:r.taxable_value,cgst:r.cgst,sgst:r.sgst,igst:r.igst});}
  }
  for(const [,g] of mp){
    if(g._cnt>1){
      const f=g._parts[0];
      const allSame=g._parts.every(p=>Math.abs(p.taxable_value-f.taxable_value)<1&&Math.abs(p.cgst-f.cgst)<1&&Math.abs(p.sgst-f.sgst)<1&&Math.abs(p.igst-f.igst)<1);
      g._isClubbed=!allSame; g._isDuplicate=allSame;
    }else{g._isClubbed=false;g._isDuplicate=false;}
  }
  return[...mp.values()];
}

function reconcile(booksRaw,twoBRaw){
  const books=groupEntries(booksRaw), twoB=groupEntries(twoBRaw);
  const results=[],used=new Set();
  for(const bk of books){
    const bG=String(bk.gstin||"").toUpperCase().trim();
    const bkTax=bk.cgst+bk.sgst+bk.igst;
    const isDup=bk._isDuplicate;
    let best=null,bType=null,bConf=-1,bIdx=-1,bStep=0;
    for(let i=0;i<twoB.length;i++){
      if(used.has(i))continue;
      const tb=twoB[i];
      if(String(tb.gstin||"").toUpperCase().trim()!==bG)continue;
      const s=similarity(bk.invoice_no,tb.invoice_no);
      const dif=dateDiffDays(bk._nd,tb._nd);
      const tvOk=Math.abs(bk.taxable_value-tb.taxable_value)<1;
      const txOk=Math.abs(bkTax-(tb.cgst+tb.sgst+tb.igst))<1;
      let t=null,c=0,step=0;
      if(s===100){
        step=1;
        if(dif<=1&&tvOk&&txOk){t="Exact Match";c=100;}
        else if(dif<=5&&tvOk&&txOk){t="Date Mismatch";c=90;step=2;}
        else if(tvOk||txOk){t="Value Mismatch";c=82;step=2;}
        else{t="Value Mismatch";c=72;step=2;}
      }else if(s>=80&&dif<=5){step=3;t="Probable Match";c=Math.round(s*(tvOk&&txOk?0.95:0.82));}
      else if(s>=65&&dif<=5&&tvOk&&txOk){step=3;t="Probable Match";c=Math.round(s*0.85);}
      if(t&&c>bConf){best=tb;bType=t;bConf=c;bIdx=i;bStep=step;}
    }
    if(best)used.add(bIdx);
    const fType=isDup?"Duplicate Detected":(best?bType:"Missing in 2B");
    const tbTX=best?(best.cgst+best.sgst+best.igst):0;
    results.push({
      id:results.length, type:fType, conf:best?bConf:0, step:bStep,
      bG:bk.gstin||"", bI:bk.invoice_no||"", bD:bk._nd||"", bName:bk.supplier_name||"",
      bTV:bk.taxable_value, bTX:bkTax, bCG:bk.cgst, bSG:bk.sgst, bIG:bk.igst, bCnt:bk._cnt,
      tG:best?.gstin||"", tI:best?.invoice_no||"", tD:best?._nd||"",
      tTV:best?.taxable_value||0, tTX:tbTX, tCG:best?.cgst||0, tSG:best?.sgst||0, tIG:best?.igst||0,
      deltaTax:bkTax-tbTX, deltaTaxable:bk.taxable_value-(best?.taxable_value||0),
      gstinValid:validateGSTIN(bk.gstin), needsReview:fType!=="Exact Match",
      reviewStatus:"pending", reviewNote:"",
      isClubbed:bk._isClubbed||false, clubbedParts:bk._parts||[],
    });
  }
  for(let i=0;i<twoB.length;i++){
    if(used.has(i))continue;
    const tb=twoB[i]; const tbTX=tb.cgst+tb.sgst+tb.igst;
    results.push({
      id:results.length, type:"Missing in Books", conf:0, step:0,
      bG:"", bI:"", bD:"", bName:"", bTV:0, bTX:0, bCG:0, bSG:0, bIG:0, bCnt:1,
      tG:tb.gstin||"", tI:tb.invoice_no||"", tD:tb._nd||"",
      tTV:tb.taxable_value, tTX:tbTX, tCG:tb.cgst, tSG:tb.sgst, tIG:tb.igst,
      deltaTax:0-tbTX, deltaTaxable:0-tb.taxable_value,
      gstinValid:validateGSTIN(tb.gstin), needsReview:true,
      reviewStatus:"pending", reviewNote:"",
    });
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — COMPLETE DETAIL
// ─────────────────────────────────────────────────────────────────────────────
function buildCSV(rows) {
  const STEP_LABEL = { 0:"—", 1:"Exact", 2:"Relaxed", 3:"Fuzzy" };
  const headers = [
    // Identity
    "Sr No", "Match Type", "Confidence %", "Match Step", "Review Status", "Review Note",
    // Books
    "Books – Supplier Name", "Books – GSTIN", "Books – GSTIN Valid",
    "Books – Invoice No", "Books – Invoice Date",
    "Books – Taxable Value", "Books – CGST", "Books – SGST", "Books – IGST",
    "Books – Total Tax", "Books – Total Invoice Value", "Books – Split Entry Count",
    // 2B
    "2B – GSTIN", "2B – Invoice No", "2B – Invoice Date",
    "2B – Taxable Value", "2B – CGST", "2B – SGST", "2B – IGST",
    "2B – Total Tax", "2B – Total Invoice Value",
    // Variances
    "Δ Taxable Value (Books − 2B)", "Δ Total Tax (Books − 2B)",
    "Date Diff (Days)", "Invoice No Match %",
    // Flags
    "ITC Claimable", "Action Required",
  ];

  const ITC_CLAIMABLE = {
    "Exact Match":        "Yes",
    "Date Mismatch":      "Likely Yes – verify date",
    "Probable Match":     "Likely Yes – verify manually",
    "Value Mismatch":     "Partial – check with vendor",
    "Missing in 2B":      "No – vendor to upload 2B",
    "Missing in Books":   "Not yet recorded",
    "Duplicate Detected": "Risk – possible double claim",
  };
  const ACTION = {
    "Exact Match":        "No action needed",
    "Date Mismatch":      "Verify date with vendor / portal",
    "Probable Match":     "Manual review – confirm invoice details",
    "Value Mismatch":     "Reconcile amounts with vendor / raise debit/credit note",
    "Missing in 2B":      "Follow up with vendor to upload invoice in GSTR-1",
    "Missing in Books":   "Record in purchase register / avail ITC",
    "Duplicate Detected": "Review books entry – possible double booking",
  };

  const body = rows.map((r, idx) => {
    const dateDiff = r.bD && r.tD ? dateDiffDays(r.bD, r.tD).toFixed(0) : "—";
    const invSim   = r.bI && r.tI ? similarity(r.bI, r.tI) + "%" : "—";
    return [
      idx + 1,
      r.type,
      r.conf || "—",
      STEP_LABEL[r.step] || "—",
      r.reviewStatus,
      r.reviewNote || "",
      // Books
      r.bName || "—",
      r.bG    || "—",
      r.bG    ? (r.gstinValid ? "Valid" : "Invalid") : "—",
      r.bI    || "—",
      r.bD    || "—",
      r.bTV   || 0,
      r.bCG   || 0,
      r.bSG   || 0,
      r.bIG   || 0,
      r.bTX   || 0,
      (r.bTV || 0) + (r.bTX || 0),
      r.bCnt  || 1,
      // 2B
      r.tG    || "—",
      r.tI    || "—",
      r.tD    || "—",
      r.tTV   || 0,
      r.tCG   || 0,
      r.tSG   || 0,
      r.tIG   || 0,
      r.tTX   || 0,
      (r.tTV || 0) + (r.tTX || 0),
      // Variances
      r.deltaTaxable !== undefined ? r.deltaTaxable.toFixed(2) : "—",
      r.deltaTax     !== undefined ? r.deltaTax.toFixed(2)     : "—",
      dateDiff,
      invSim,
      // Flags
      ITC_CLAIMABLE[r.type] || "—",
      ACTION[r.type]        || "—",
    ];
  });

  const escape = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers, ...body].map(row => row.map(escape).join(",")).join("\n");
}

function downloadCSV(rows, filename = "itc_reconciliation.csv") {
  const csv = buildCSV(rows);
  const bom = "\uFEFF"; // UTF-8 BOM so Excel opens correctly
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ─────────────────────────────────────────────────────────────────────────────
// SAMPLE DATA
// ─────────────────────────────────────────────────────────────────────────────
const SAMPLE_BOOKS = [
  // 1. Exact Match (after clubbing: 100000+50000=150000 matches 2B)
  { gstin:"27AABCU9603R1ZX", invoice_no:"INV/24-25/001", invoice_date:"01/04/2025", taxable_value:100000, cgst:9000,  sgst:9000,  igst:0,     supplier_name:"Acme Supplies Pvt Ltd" },
  // 2. Clubbed/multi-rate line item for same invoice (will be grouped with above)
  { gstin:"27AABCU9603R1ZX", invoice_no:"INV/24-25/001", invoice_date:"01/04/2025", taxable_value:50000,  cgst:4500,  sgst:4500,  igst:0,     supplier_name:"Acme Supplies Pvt Ltd" },
  // 3. Probable Match — fuzzy invoice no (books: 2425/12 vs 2B: 24-25/0012)
  { gstin:"29AAHCS8165F1ZS", invoice_no:"2425/12",       invoice_date:"2025-04-05", taxable_value:200000, cgst:0,     sgst:0,     igst:36000, supplier_name:"South Tech Solutions" },
  // 4. Date Mismatch — exact invoice but dates differ by 2 days, amounts match
  { gstin:"33AADCK1432E1ZP", invoice_no:"CH-0045",       invoice_date:"10-Apr-25",  taxable_value:75000,  cgst:6750,  sgst:6750,  igst:0,     supplier_name:"Chennai Distributors" },
  // 5. Exact Match — invoice no has spaces, 2B doesn't (DL 2025 099 vs DL2025099)
  { gstin:"07AANCA8786K1ZR", invoice_no:"DL 2025 099",   invoice_date:"15/04/2025", taxable_value:500000, cgst:0,     sgst:0,     igst:90000, supplier_name:"Delhi Traders Co" },
  // 6. Missing in 2B — exists in books only, vendor hasn't filed
  { gstin:"19AACCS3654R1ZP", invoice_no:"BEN/APR/001",   invoice_date:"20/04/2025", taxable_value:30000,  cgst:1350,  sgst:1350,  igst:0,     supplier_name:"Bengal Goods Ltd" },
  // 7. Value Mismatch — books tax (14400) != 2B tax (16200), taxable 80000 vs 90000
  { gstin:"27AABCU9603R1ZX", invoice_no:"INV/24-25/005", invoice_date:"25/04/2025", taxable_value:80000,  cgst:7200,  sgst:7200,  igst:0,     supplier_name:"Acme Supplies Pvt Ltd" },
  // 8. Exact Match — HR-INV-2025-55 matches perfectly
  { gstin:"06AAALC7890M1ZD", invoice_no:"HR-INV-2025-55",invoice_date:"28/04/2025", taxable_value:120000, cgst:10800, sgst:10800, igst:0,     supplier_name:"Haryana Components" },
  // 9. Missing in 2B — HR-INV-2025-56 only in books
  { gstin:"06AAALC7890M1ZD", invoice_no:"HR-INV-2025-56",invoice_date:"30/04/2025", taxable_value:45000,  cgst:4050,  sgst:4050,  igst:0,     supplier_name:"Haryana Components" },
  // 10. Value Mismatch — GJ taxable 310000 vs 315000, tax 55800 vs 56700
  { gstin:"24AABFK2341P1ZR", invoice_no:"GJ/0099/25",    invoice_date:"05/05/2025", taxable_value:310000, cgst:0,     sgst:0,     igst:55800, supplier_name:"Gujarat Fabricators" },
  // 11. Duplicate Detected — same invoice entered twice with same amounts
  { gstin:"36AADCS1234K1ZQ", invoice_no:"TG/2025/088",   invoice_date:"12/04/2025", taxable_value:95000,  cgst:8550,  sgst:8550,  igst:0,     supplier_name:"Telangana Steel Works" },
  { gstin:"36AADCS1234K1ZQ", invoice_no:"TG/2025/088",   invoice_date:"12/04/2025", taxable_value:95000,  cgst:8550,  sgst:8550,  igst:0,     supplier_name:"Telangana Steel Works" },
  // 12. Invalid GSTIN + Exact Match — GSTIN format is wrong
  { gstin:"99XXXXX0000XZZZ", invoice_no:"BAD-GSTIN-001", invoice_date:"15/04/2025", taxable_value:25000,  cgst:2250,  sgst:2250,  igst:0,     supplier_name:"Unknown Vendor" },
  // 13. Value Mismatch — books higher than 2B (audit risk scenario)
  { gstin:"23AABCM5678N1ZG", invoice_no:"MP/2025/112",   invoice_date:"18/04/2025", taxable_value:180000, cgst:16200, sgst:16200, igst:0,     supplier_name:"MP Industries Ltd" },
  // 14. Date Mismatch — same amounts, date differs by 4 days
  { gstin:"08AADCR9012L1ZH", invoice_no:"RJ-2025-044",   invoice_date:"22/04/2025", taxable_value:65000,  cgst:0,     sgst:0,     igst:11700, supplier_name:"Rajasthan Minerals" },
  // 15. Probable Match — fuzzy invoice (PNB-INV-2025-33 vs PNB/INV/2025/033)
  { gstin:"03AABCP4321J1ZF", invoice_no:"PNB-INV-2025-33",invoice_date:"25/04/2025",taxable_value:140000, cgst:12600, sgst:12600, igst:0,     supplier_name:"Punjab Textiles" },
  // 16. Missing in 2B — large amount, high impact
  { gstin:"09AABCU7654H1ZE", invoice_no:"UP/2025/201",   invoice_date:"28/04/2025", taxable_value:450000, cgst:40500, sgst:40500, igst:0,     supplier_name:"UP Chemicals Corp" },
];
const SAMPLE_2B = [
  // Matches Books #1+#2 (clubbed) — Exact Match
  { gstin:"27AABCU9603R1ZX", invoice_no:"INV/24-25/001", invoice_date:"2025-04-01", taxable_value:150000, cgst:13500, sgst:13500, igst:0,     supplier_name:"Acme Supplies Pvt Ltd" },
  // Matches Books #3 — Probable Match (fuzzy inv no: 24-25/0012 vs 2425/12)
  { gstin:"29AAHCS8165F1ZS", invoice_no:"24-25/0012",    invoice_date:"2025-04-05", taxable_value:200000, cgst:0,     sgst:0,     igst:36000, supplier_name:"South Tech Solutions" },
  // Matches Books #4 — Date Mismatch (12th vs 10th, amounts match)
  { gstin:"33AADCK1432E1ZP", invoice_no:"CH-0045",       invoice_date:"2025-04-12", taxable_value:75000,  cgst:6750,  sgst:6750,  igst:0,     supplier_name:"Chennai Distributors" },
  // Matches Books #5 — Exact Match (normalized inv no match)
  { gstin:"07AANCA8786K1ZR", invoice_no:"DL2025099",     invoice_date:"2025-04-15", taxable_value:500000, cgst:0,     sgst:0,     igst:90000, supplier_name:"Delhi Traders Co" },
  // Matches Books #7 — Value Mismatch (2B has higher amount: 90000 vs 80000)
  { gstin:"27AABCU9603R1ZX", invoice_no:"INV/24-25/005", invoice_date:"2025-04-25", taxable_value:90000,  cgst:8100,  sgst:8100,  igst:0,     supplier_name:"Acme Supplies Pvt Ltd" },
  // Matches Books #8 — Exact Match
  { gstin:"06AAALC7890M1ZD", invoice_no:"HR-INV-2025-55",invoice_date:"2025-04-28", taxable_value:120000, cgst:10800, sgst:10800, igst:0,     supplier_name:"Haryana Components" },
  // Matches Books #10 — Value Mismatch (taxable: 315000 vs 310000)
  { gstin:"24AABFK2341P1ZR", invoice_no:"GJ/0099/25",    invoice_date:"2025-05-05", taxable_value:315000, cgst:0,     sgst:0,     igst:56700, supplier_name:"Gujarat Fabricators" },
  // Missing in Books — only in 2B, not recorded in purchase register
  { gstin:"32AACCB5678Q1ZN", invoice_no:"KL-2025-007",   invoice_date:"2025-04-18", taxable_value:88000,  cgst:7920,  sgst:7920,  igst:0,     supplier_name:"Kerala Traders" },
  // Matches Books #11 — Duplicate (will match one, other becomes missing or dup)
  { gstin:"36AADCS1234K1ZQ", invoice_no:"TG/2025/088",   invoice_date:"2025-04-12", taxable_value:95000,  cgst:8550,  sgst:8550,  igst:0,     supplier_name:"Telangana Steel Works" },
  // Matches Books #12 — Invalid GSTIN exact match
  { gstin:"99XXXXX0000XZZZ", invoice_no:"BAD-GSTIN-001", invoice_date:"2025-04-15", taxable_value:25000,  cgst:2250,  sgst:2250,  igst:0,     supplier_name:"Unknown Vendor" },
  // Matches Books #13 — Value Mismatch (books HIGHER: 180000 vs 160000, audit risk)
  { gstin:"23AABCM5678N1ZG", invoice_no:"MP/2025/112",   invoice_date:"2025-04-18", taxable_value:160000, cgst:14400, sgst:14400, igst:0,     supplier_name:"MP Industries Ltd" },
  // Matches Books #14 — Date Mismatch (26th vs 22nd, amounts match)
  { gstin:"08AADCR9012L1ZH", invoice_no:"RJ-2025-044",   invoice_date:"2025-04-26", taxable_value:65000,  cgst:0,     sgst:0,     igst:11700, supplier_name:"Rajasthan Minerals" },
  // Matches Books #15 — Probable Match (fuzzy: PNB/INV/2025/033 vs PNB-INV-2025-33)
  { gstin:"03AABCP4321J1ZF", invoice_no:"PNB/INV/2025/033",invoice_date:"2025-04-25",taxable_value:140000, cgst:12600, sgst:12600, igst:0,    supplier_name:"Punjab Textiles" },
  // Missing in Books #2 — another unbooked 2B entry
  { gstin:"21AABCO3456D1ZM", invoice_no:"OD-2025-019",   invoice_date:"2025-05-02", taxable_value:72000,  cgst:6480,  sgst:6480,  igst:0,     supplier_name:"Odisha Polymers" },
];

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN
// ─────────────────────────────────────────────────────────────────────────────
const MC = {
  "Exact Match":        { color:"#10B981", bg:"#052e1c", border:"#10B98130" },
  "Value Mismatch":     { color:"#F59E0B", bg:"#1c1005", border:"#F59E0B30" },
  "Date Mismatch":      { color:"#A78BFA", bg:"#150d26", border:"#A78BFA30" },
  "Probable Match":     { color:"#60A5FA", bg:"#0c1a35", border:"#60A5FA30" },
  "Missing in 2B":      { color:"#F87171", bg:"#2d0808", border:"#F8717130" },
  "Missing in Books":   { color:"#FB923C", bg:"#2d1005", border:"#FB923C30" },
  "Duplicate Detected": { color:"#E879F9", bg:"#25081a", border:"#E879F930" },
};
const ICONS = {
  "Exact Match":<CheckCircle size={10}/>, "Value Mismatch":<AlertTriangle size={10}/>,
  "Date Mismatch":<Calendar size={10}/>,  "Probable Match":<AlertCircle size={10}/>,
  "Missing in 2B":<XCircle size={10}/>,   "Missing in Books":<XCircle size={10}/>,
  "Duplicate Detected":<Copy size={10}/>,
};

function Badge({type}){
  const c=MC[type]||{color:"#94A3B8",bg:"#1e293b",border:"#33415530"};
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:c.bg,color:c.color,border:`1px solid ${c.border}`,borderRadius:5,padding:"2px 8px",fontSize:10,fontWeight:700,whiteSpace:"nowrap"}}>{ICONS[type]} {type}</span>;
}
function ConfBar({value}){
  if(!value)return<span style={{color:"#334155",fontSize:11}}>—</span>;
  const col=value>=90?"#10B981":value>=75?"#F59E0B":"#F87171";
  return(
    <div style={{display:"flex",alignItems:"center",gap:6}}>
      <div style={{width:38,height:3,background:"#1e293b",borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${value}%`,background:col,borderRadius:2}}/>
      </div>
      <span style={{fontSize:10,color:col,fontWeight:700,fontFamily:"monospace"}}>{value}%</span>
    </div>
  );
}
function StatusChip({status}){
  const M={pending:{color:"#60A5FA",bg:"#0c1a35",label:"Pending"},approved:{color:"#10B981",bg:"#052e1c",label:"Approved"},flagged:{color:"#F87171",bg:"#2d0808",label:"Flagged"}};
  const c=M[status]||M.pending;
  return <span style={{background:c.bg,color:c.color,padding:"2px 8px",borderRadius:5,fontSize:10,fontWeight:700}}>{c.label}</span>;
}
function KPICard({label,value,sub,color,icon,onClick}){
  return(
    <div onClick={onClick} style={{background:"#0D1424",border:`1px solid #1E2D45`,borderLeft:`3px solid ${color}`,borderRadius:10,padding:"15px 18px",cursor:onClick?"pointer":"default"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:9,color:"#64748B",marginBottom:7,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
          <div style={{fontSize:25,fontWeight:700,color,fontFamily:"monospace",lineHeight:1}}>{value}</div>
          {sub&&<div style={{fontSize:9,color:"#475569",marginTop:5}}>{sub}</div>}
        </div>
        <div style={{color,opacity:0.4}}>{icon}</div>
      </div>
    </div>
  );
}
function ChartTip({active,payload,label}){
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:"#0D1424",border:"1px solid #1E2D45",borderRadius:8,padding:"10px 14px",fontSize:11}}>
      <div style={{color:"#94A3B8",marginBottom:6}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{color:p.color,fontFamily:"monospace"}}>{p.name}: {p.value}</div>)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD PANEL
// ─────────────────────────────────────────────────────────────────────────────
function UploadPanel({title,sub,icon,data,fileName,color,onFile,fileRef}){
  const loaded=data.length>0;
  return(
    <div style={{background:"#0D1424",border:`1px solid #1E2D45`,borderRadius:12,padding:22}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
        <div style={{width:34,height:34,background:`${color}18`,border:`1px solid ${color}30`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color}}>{icon}</div>
        <div>
          <div style={{fontWeight:600,fontSize:14,color:"#CBD5E1"}}>{title}</div>
          <div style={{fontSize:10,color:"#64748B"}}>{sub}</div>
        </div>
        {loaded&&<span style={{marginLeft:"auto",background:`${color}15`,color,border:`1px solid ${color}25`,padding:"2px 10px",borderRadius:20,fontSize:10,fontWeight:700}}>{data.length} rows</span>}
      </div>
      <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={e=>onFile(e.target.files[0])}/>
      <div onClick={()=>fileRef.current?.click()} style={{border:`2px dashed ${loaded?color:"#1E2D45"}`,borderRadius:10,padding:"22px 20px",textAlign:"center",cursor:"pointer",background:loaded?`${color}06`:"transparent"}}>
        {loaded?(
          <><CheckCircle size={20} style={{margin:"0 auto 8px",color}}/><div style={{fontSize:12,color,fontWeight:600}}>{fileName}</div><div style={{fontSize:10,color:"#475569",marginTop:3}}>Click to replace</div></>
        ):(
          <><Upload size={20} style={{margin:"0 auto 8px",color:"#334155"}}/><div style={{fontSize:12,color:"#94A3B8"}}>Drop CSV or click to browse</div><div style={{fontSize:10,color:"#475569",marginTop:5}}>GSTIN · Invoice No · Date · Taxable · CGST · SGST · IGST — auto-detected</div></>
        )}
      </div>
      {loaded&&(
        <div style={{marginTop:10,background:"#070B14",borderRadius:8,overflow:"auto",maxHeight:100}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"monospace",fontSize:10}}>
            <thead><tr>{["GSTIN","Invoice","Date","Taxable","Tax"].map(h=><th key={h} style={{padding:"5px 8px",color:"#475569",textAlign:"left",borderBottom:"1px solid #1E2D45"}}>{h}</th>)}</tr></thead>
            <tbody>
              {data.slice(0,4).map((r,i)=>(
                <tr key={i}>{[r.gstin?.slice(0,15),r.invoice_no?.slice(0,14),String(r.invoice_date||"").slice(0,10),inrFmt(r.taxable_value,true),inrFmt(r.cgst+r.sgst+r.igst,true)].map((v,j)=>(
                  <td key={j} style={{padding:"4px 8px",color:"#94A3B8",borderBottom:"1px solid #1E2D4518"}}>{v}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
          {data.length>4&&<div style={{color:"#475569",fontSize:10,padding:"4px 8px"}}>+{data.length-4} more…</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const [books,setBooks]=useState([]);
  const [twoB,setTwoB]=useState([]);
  const [results,setResults]=useState(null);
  const [tab,setTab]=useState("upload");
  const [filter,setFilter]=useState("All");
  const [search,setSearch]=useState("");
  const [monthFilter,setMonthFilter]=useState("All");
  const [booksName,setBooksName]=useState("");
  const [twoBName,setTwoBName]=useState("");
  const [reviewItems,setReviewItems]=useState({});
  const [reviewFilter,setReviewFilter]=useState("pending");
  const [reviewIssueFilter,setReviewIssueFilter]=useState("all");
  const [reviewSearch,setReviewSearch]=useState("");
  const [noteInput,setNoteInput]=useState({});
  const [editingNoteId,setEditingNoteId]=useState(null);
  const [expandedVendor,setExpandedVendor]=useState(null);
  const [itcSection,setItcSection]=useState(null);
  const [valueApprovals,setValueApprovals]=useState({});
  const booksRef=useRef(null), twoBRef=useRef(null);

  const parseCSV=(file,setFn,setName)=>{
    if(!file)return; setName(file.name);
    const rd=new FileReader();
    rd.onload=e=>{const p=Papa.parse(e.target.result.trim(),{header:true,skipEmptyLines:true});setFn(p.data.map(mapRow));};
    rd.readAsText(file);
  };

  const loadSample=()=>{ setBooks(SAMPLE_BOOKS);setBooksName("sample_books.csv");setTwoB(SAMPLE_2B);setTwoBName("sample_2b.csv");setResults(null);setReviewItems({});setValueApprovals({}); };

  const runReconcile=()=>{
    if(!books.length||!twoB.length)return;
    const r=reconcile(books,twoB);
    setResults(r);
    setReviewItems(Object.fromEntries(r.filter(x=>x.needsReview).map(x=>[x.id,{status:"pending",note:""}])));
    setTab("dashboard");setFilter("All");setSearch("");setMonthFilter("All");
  };

  const updateReview=(id,status,note)=>setReviewItems(prev=>({...prev,[id]:{status,note:note??prev[id]?.note??""}}));

  const enriched=useMemo(()=>{
    if(!results)return[];
    return results.map(r=>({...r,reviewStatus:reviewItems[r.id]?.status??r.reviewStatus,reviewNote:reviewItems[r.id]?.note??r.reviewNote}));
  },[results,reviewItems]);

  const stats=useMemo(()=>{
    if(!enriched.length)return null;
    const counts=Object.fromEntries(Object.keys(MC).map(k=>[k,0]));
    for(const r of enriched)counts[r.type]=(counts[r.type]||0)+1;
    const total=enriched.length;
    return{
      counts, total,
      exactPct:total?Math.round((counts["Exact Match"]/total)*100):0,
      eligibleITC:enriched.filter(r=>["Exact Match","Date Mismatch","Probable Match"].includes(r.type)).reduce((s,r)=>s+r.tTX,0),
      riskITC:enriched.filter(r=>r.type==="Value Mismatch").reduce((s,r)=>s+r.tTX,0),
      missing2B:enriched.filter(r=>r.type==="Missing in 2B").reduce((s,r)=>s+r.bTX,0),
      missingBk:enriched.filter(r=>r.type==="Missing in Books").reduce((s,r)=>s+r.tTX,0),
      dupTV:enriched.filter(r=>r.type==="Duplicate Detected").reduce((s,r)=>s+r.bTV,0),
      invalid:enriched.filter(r=>!r.gstinValid&&r.bG).length,
      pending:Object.values(reviewItems).filter(v=>v.status==="pending").length,
      approved:Object.values(reviewItems).filter(v=>v.status==="approved").length,
      flagged:Object.values(reviewItems).filter(v=>v.status==="flagged").length,
    };
  },[enriched,reviewItems]);

  const monthOptions=useMemo(()=>{
    const months=new Set(enriched.map(r=>(r.bD||r.tD||"").slice(0,7)).filter(Boolean));
    return["All",...[...months].sort()];
  },[enriched]);

  const vendorStats=useMemo(()=>{
    const mp=new Map();
    for(const r of enriched){
      const gstin=r.bG||r.tG; if(!gstin)continue;
      if(!mp.has(gstin))mp.set(gstin,{gstin,name:r.bName||"",exact:0,mismatch:0,missing2B:0,missingBk:0,dup:0,probable:0,totalTV:0,totalTX:0,valid:r.gstinValid,
        booksTV:0,booksTX:0,twoBTV:0,twoBTX:0,invoices:[]});
      const v=mp.get(gstin);
      if(!v.name && r.bName) v.name = r.bName;
      if(r.type==="Exact Match")v.exact++;
      else if(r.type==="Value Mismatch"||r.type==="Date Mismatch")v.mismatch++;
      else if(r.type==="Missing in 2B")v.missing2B++;
      else if(r.type==="Missing in Books")v.missingBk++;
      else if(r.type==="Duplicate Detected")v.dup++;
      else if(r.type==="Probable Match")v.probable++;
      v.totalTV+=r.bTV||r.tTV; v.totalTX+=r.bTX||r.tTX;
      v.booksTV+=r.bTV; v.booksTX+=r.bTX;
      v.twoBTV+=r.tTV; v.twoBTX+=r.tTX;
      v.invoices.push(r);
    }
    return[...mp.values()].sort((a,b)=>b.totalTV-a.totalTV);
  },[enriched]);

  const filtered=useMemo(()=>enriched.filter(r=>{
    if(filter!=="All"&&r.type!==filter)return false;
    const d=r.bD||r.tD||"";
    if(monthFilter!=="All"&&!d.startsWith(monthFilter))return false;
    if(search){const s=search.toLowerCase();return r.bI.toLowerCase().includes(s)||r.tI.toLowerCase().includes(s)||r.bG.toLowerCase().includes(s)||r.tG.toLowerCase().includes(s)||(r.bName||"").toLowerCase().includes(s);}
    return true;
  }),[enriched,filter,search,monthFilter]);

  const reviewIssueTypes=useMemo(()=>{
    const types=new Set(enriched.filter(r=>r.needsReview).map(r=>r.type));
    return["all",...[...types].sort()];
  },[enriched]);

  const reviewQueue=useMemo(()=>enriched.filter(r=>{
    if(!r.needsReview)return false;
    if(reviewFilter!=="all"&&r.reviewStatus!==reviewFilter)return false;
    if(reviewIssueFilter!=="all"&&r.type!==reviewIssueFilter)return false;
    if(reviewSearch){const s=reviewSearch.toLowerCase();return r.bI.toLowerCase().includes(s)||r.tI.toLowerCase().includes(s)||r.bG.toLowerCase().includes(s);}
    return true;
  }),[enriched,reviewFilter,reviewIssueFilter,reviewSearch]);

  const pieData=useMemo(()=>Object.entries(stats?.counts||{}).filter(([,v])=>v>0).map(([name,value])=>({name,value})),[stats]);
  const monthBar=useMemo(()=>{
    const mp=new Map();
    enriched.forEach(r=>{const d=(r.bD||r.tD||"").slice(0,7);if(!d)return;if(!mp.has(d))mp.set(d,{month:d,matched:0,risk:0,unmatched:0});const v=mp.get(d);if(r.type==="Exact Match")v.matched++;else if(["Value Mismatch","Date Mismatch","Probable Match"].includes(r.type))v.risk++;else v.unmatched++;});
    return[...mp.values()].sort((a,b)=>a.month.localeCompare(b.month));
  },[enriched]);

  const itcStats=useMemo(()=>{
    if(!enriched.length)return null;
    // Separate approved mismatches that should move to eligible
    const approvedIds=new Set(Object.entries(reviewItems).filter(([,v])=>v.status==="approved").map(([k])=>Number(k)));
    const valueApprovedIds=new Set(Object.keys(valueApprovals).map(Number));
    // Categorize each entry
    const eligible=[],dateMismatchEligible=[],approvedMismatch=[],valueApproved=[];
    const probable=[],atRisk=[],blocked=[],unbooked=[],duplicate=[],clubbed=[];
    for(const r of enriched){
      if(r.isClubbed)clubbed.push(r);
      // Value-approved items go to eligible with their chosen amount
      if(valueApprovedIds.has(r.id)){valueApproved.push(r);continue;}
      // Approved mismatches (not exact/date) go to eligible
      if(approvedIds.has(r.id)&&!["Exact Match","Date Mismatch"].includes(r.type)){approvedMismatch.push(r);continue;}
      if(r.type==="Exact Match")eligible.push(r);
      else if(r.type==="Date Mismatch")dateMismatchEligible.push(r);
      else if(r.type==="Probable Match")probable.push(r);
      else if(r.type==="Value Mismatch")atRisk.push(r);
      else if(r.type==="Missing in 2B")blocked.push(r);
      else if(r.type==="Missing in Books")unbooked.push(r);
      else if(r.type==="Duplicate Detected")duplicate.push(r);
    }
    const allEligible=[...eligible,...dateMismatchEligible,...approvedMismatch,...valueApproved];
    const st=(a,f)=>a.reduce((s,r)=>s+(r[f]||0),0);
    // For value-approved, use the approved amount
    const vaITC=valueApproved.reduce((s,r)=>{const va=valueApprovals[r.id];return s+(va?va.approvedTax:r.tTX);},0);
    const vaTV=valueApproved.reduce((s,r)=>{const va=valueApprovals[r.id];return s+(va?va.approvedTV:r.tTV);},0);
    return{
      cats:{eligible,dateMismatchEligible,approvedMismatch,valueApproved,probable,atRisk,blocked,unbooked,duplicate,clubbed},
      allEligible,
      totalBooksITC:enriched.reduce((s,r)=>s+r.bTX,0),
      totalTwoBITC:enriched.reduce((s,r)=>s+r.tTX,0),
      eligibleITC:st(eligible,"tTX")+st(dateMismatchEligible,"tTX")+st(approvedMismatch,"tTX")+vaITC,
      eligibleTV:st(eligible,"tTV")+st(dateMismatchEligible,"tTV")+st(approvedMismatch,"tTV")+vaTV,
      exactITC:st(eligible,"tTX"),exactTV:st(eligible,"tTV"),
      dateITC:st(dateMismatchEligible,"tTX"),dateTV:st(dateMismatchEligible,"tTV"),
      approvedITC:st(approvedMismatch,"tTX"),approvedTV:st(approvedMismatch,"tTV"),
      vaITC,vaTV,
      probableITC:st(probable,"tTX"),probableTV:st(probable,"tTV"),
      atRiskITC:st(atRisk,"tTX"),atRiskTV:st(atRisk,"tTV"),
      blockedITC:st(blocked,"bTX"),blockedTV:st(blocked,"bTV"),
      unbookedITC:st(unbooked,"tTX"),unbookedTV:st(unbooked,"tTV"),
      dupITC:st(duplicate,"bTX"),dupTV:st(duplicate,"bTV"),
      clubbedITC:st(clubbed,"bTX"),clubbedTV:st(clubbed,"bTV"),
    };
  },[enriched,reviewItems,valueApprovals]);

  const S={
    root:{background:"#060A13",minHeight:"100vh",color:"#CBD5E1",fontFamily:"'Inter',system-ui,sans-serif",fontSize:13},
    header:{background:"#0D1424",borderBottom:"1px solid #1E2D45",padding:"16px 28px",display:"flex",alignItems:"center",gap:14},
    nav:{display:"flex",gap:0,padding:"0 28px",background:"#0A0F1C",borderBottom:"1px solid #1E2D45",overflowX:"auto"},
    content:{padding:"24px 28px",maxWidth:1400,margin:"0 auto"},
    navBtn:a=>({cursor:"pointer",background:"none",border:"none",borderBottom:`2px solid ${a?"#3B82F6":"transparent"}`,color:a?"#E2E8F0":"#64748B",padding:"13px 16px",fontSize:11,fontWeight:600,fontFamily:"inherit",marginBottom:-1,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6}),
    card:{background:"#0D1424",border:"1px solid #1E2D45",borderRadius:12,padding:20},
    primaryBtn:{cursor:"pointer",background:"#1D6EE8",color:"#fff",border:"none",borderRadius:8,padding:"11px 26px",fontSize:12,fontWeight:600,fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:7},
    ghostBtn:{cursor:"pointer",background:"transparent",color:"#94A3B8",border:"1px solid #1E2D45",borderRadius:8,padding:"7px 14px",fontSize:11,fontWeight:500,fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6},
    pill:(a,col)=>({cursor:"pointer",background:a?`${col}20`:"transparent",color:a?col:"#64748B",border:`1px solid ${a?col:"#1E2D45"}`,borderRadius:20,padding:"4px 11px",fontSize:10,fontWeight:700,fontFamily:"inherit"}),
    input:{background:"#070B14",border:"1px solid #1E2D45",borderRadius:8,padding:"7px 12px 7px 28px",color:"#CBD5E1",fontFamily:"inherit",fontSize:11,outline:"none"},
    mono:{fontFamily:"monospace",fontSize:11},
    divider:{borderTop:"1px solid #1E2D45",margin:"14px 0"},
    sectionTitle:{fontSize:10,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14},
  };

  return(
    <div style={S.root}>
      {/* HEADER */}
      <div style={S.header}>
        <div style={{width:38,height:38,background:"linear-gradient(135deg,#1D6EE8,#7C3AED)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <BarChart2 size={20} color="#fff"/>
        </div>
        <div>
          <div style={{fontSize:16,fontWeight:700,letterSpacing:"-0.3px",color:"#E2E8F0"}}>ITC Reconciliation Tool</div>
          <div style={{fontSize:10,color:"#475569",marginTop:1}}>GST 2B vs Books · Fuzzy + Rule-Based Matching Engine</div>
        </div>
        {results&&(
          <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
            {stats&&<div style={{display:"flex",gap:10,marginRight:8,fontSize:10}}>
              <span style={{color:"#10B981"}}>{stats.counts["Exact Match"]} matched</span>
              <span style={{color:"#64748B"}}>·</span>
              <span style={{color:"#F87171"}}>{(stats.counts["Missing in 2B"]||0)+(stats.counts["Missing in Books"]||0)} missing</span>
              <span style={{color:"#64748B"}}>·</span>
              <span style={{color:"#A78BFA"}}>{stats.pending} pending review</span>
            </div>}
            <button style={S.ghostBtn} onClick={()=>downloadCSV(enriched,"itc_full_reconciliation.csv")}><Download size={12}/> Export All</button>
            <button style={S.ghostBtn} onClick={()=>{setResults(null);setTab("upload");setBooks([]);setTwoB([]);setBooksName("");setTwoBName("");}}>
              <RefreshCw size={12}/> Reset
            </button>
          </div>
        )}
      </div>

      {/* NAV */}
      <div style={S.nav}>
        {[["upload",<Upload size={12}/>,"Upload Data"],["dashboard",<BarChart2 size={12}/>,"Dashboard"],["itc",<Shield size={12}/>,"ITC Available"],["results",<FileText size={12}/>,"Results"],["vendors",<Users size={12}/>,"Vendor Analysis"],["review",<ClipboardList size={12}/>,`Manual Review${stats?.pending?` (${stats.pending})`:""}`]].map(([t,icon,label])=>(
          <button key={t} style={S.navBtn(tab===t)} onClick={()=>setTab(t)} disabled={!results&&t!=="upload"}>{icon} {label}</button>
        ))}
      </div>

      <div style={S.content}>

        {/* ══ UPLOAD ══ */}
        {tab==="upload"&&(
          <div>
            <div style={{display:"flex",alignItems:"flex-end",marginBottom:22}}>
              <div>
                <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px",color:"#E2E8F0"}}>Upload Source Files</h2>
                <p style={{fontSize:11,color:"#64748B",margin:0}}>CSV exports from your purchase register and GSTR-2B portal. Column names auto-detected.</p>
              </div>
              <button style={{...S.ghostBtn,marginLeft:"auto",borderStyle:"dashed",fontSize:11}} onClick={loadSample}>▶ Load Sample Data (17×14)</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:22}}>
              <UploadPanel title="Books of Accounts" sub="Purchase register / ledger export" icon={<FileText size={17}/>} data={books} fileName={booksName} color="#3B82F6" onFile={f=>parseCSV(f,setBooks,setBooksName)} fileRef={booksRef}/>
              <UploadPanel title="GSTR-2B Portal" sub="Auto-drafted ITC from GST portal" icon={<BarChart2 size={17}/>} data={twoB} fileName={twoBName} color="#8B5CF6" onFile={f=>parseCSV(f,setTwoB,setTwoBName)} fileRef={twoBRef}/>
            </div>
            <div style={{...S.card,marginBottom:22}}>
              <div style={S.sectionTitle}>Accepted CSV Columns</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:8,marginBottom:16}}>
                {[["gstin","Supplier GSTIN / vendor_gstin / gst_no"],["invoice_no","invoice_number / bill_no / voucher_no"],["invoice_date","date / doc_date / bill_date (any format)"],["taxable_value","assessable_value / net_amount / taxable"],["cgst","cgst_amount / central_gst"],["sgst","sgst_amount / state_gst / utgst"],["igst","igst_amount / integrated_gst"]].map(([col,hint])=>(
                  <div key={col} style={{background:"#070B14",border:"1px solid #1E2D45",padding:"8px 10px",borderRadius:7}}>
                    <div style={{fontFamily:"monospace",fontSize:10,color:"#60A5FA",marginBottom:3}}>{col}</div>
                    <div style={{fontSize:9,color:"#475569"}}>{hint}</div>
                  </div>
                ))}
              </div>
              <div style={S.divider}/>
              <div style={S.sectionTitle}>Matching Logic</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                {[["Step 1 – Exact","GSTIN + Normalised InvNo + Date ±1d + Tax match → 100%","#10B981"],["Step 2 – Relaxed","Exact InvNo + Date ±5d, value may differ → 72–90%","#F59E0B"],["Step 3 – Fuzzy","Levenshtein ≥65% on InvNo + GSTIN + Date ±5d → 65–85%","#A78BFA"],["Step 4 – Review","Low confidence / unmatched → Manual Review Queue","#F87171"]].map(([t,d,col])=>(
                  <div key={t} style={{borderLeft:`3px solid ${col}`,paddingLeft:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:col,marginBottom:3}}>{t}</div>
                    <div style={{fontSize:10,color:"#64748B"}}>{d}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{textAlign:"center"}}>
              <button style={{...S.primaryBtn,opacity:books.length&&twoB.length?1:0.4,fontSize:13,padding:"13px 40px"}} onClick={runReconcile} disabled={!books.length||!twoB.length}><Zap size={16}/> Run Reconciliation</button>
              {(!books.length||!twoB.length)&&<div style={{fontSize:11,color:"#475569",marginTop:8}}>Upload both files to proceed</div>}
            </div>
          </div>
        )}

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard"&&stats&&(
          <div>
            <div style={{marginBottom:20}}>
              <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px",color:"#E2E8F0"}}>Reconciliation Dashboard</h2>
              <p style={{fontSize:11,color:"#64748B",margin:0}}>{books.length} Books entries vs {twoB.length} GSTR-2B entries → {stats.total} reconciliation records</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
              <KPICard label="Total Records"    value={stats.total}                    sub="across both sources"              color="#60A5FA" icon={<FileText size={20}/>} onClick={()=>{setFilter("All");setTab("results");}}/>
              <KPICard label="Exact Matches"    value={stats.counts["Exact Match"]}    sub={`${stats.exactPct}% match rate`}  color="#10B981" icon={<CheckCircle size={20}/>} onClick={()=>{setFilter("Exact Match");setTab("results");}}/>
              <KPICard label="Pending Review"   value={stats.pending}                  sub={`${stats.approved} approved · ${stats.flagged} flagged`} color="#A78BFA" icon={<ClipboardList size={20}/>} onClick={()=>setTab("review")}/>
              <KPICard label="Invalid GSTINs"   value={stats.invalid}                  sub="format check failed"              color="#F87171" icon={<Shield size={20}/>}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18}}>
              <KPICard label="Missing in 2B"    value={stats.counts["Missing in 2B"]}  sub={inrFmt(stats.missing2B,true)+" blocked ITC"}  color="#F87171" icon={<XCircle size={20}/>} onClick={()=>{setFilter("Missing in 2B");setTab("results");}}/>
              <KPICard label="Missing in Books" value={stats.counts["Missing in Books"]}sub={inrFmt(stats.missingBk,true)+" unbooked ITC"} color="#FB923C" icon={<AlertTriangle size={20}/>} onClick={()=>{setFilter("Missing in Books");setTab("results");}}/>
              <KPICard label="Value Mismatch"   value={stats.counts["Value Mismatch"]} sub={inrFmt(stats.riskITC,true)+" at risk"}        color="#F59E0B" icon={<AlertCircle size={20}/>} onClick={()=>{setFilter("Value Mismatch");setTab("results");}}/>
              <KPICard label="Duplicates"        value={stats.counts["Duplicate Detected"]} sub={inrFmt(stats.dupTV,true)+" taxable value"} color="#E879F9" icon={<Copy size={20}/>} onClick={()=>{setFilter("Duplicate Detected");setTab("results");}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"5fr 3fr",gap:18,marginBottom:18}}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Month-wise Reconciliation Status</div>
                {monthBar.length>0?(
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={monthBar} margin={{top:5,right:10,left:0,bottom:5}} barSize={20}>
                      <XAxis dataKey="month" tick={{fill:"#475569",fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:"#475569",fontSize:10}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip/>} cursor={{fill:"#1E2D4530"}}/>
                      <Legend iconType="square" iconSize={8} wrapperStyle={{fontSize:10,color:"#64748B"}}/>
                      <Bar dataKey="matched" name="Matched" fill="#10B981" radius={[3,3,0,0]}/>
                      <Bar dataKey="risk" name="Risk/Mismatch" fill="#F59E0B" radius={[3,3,0,0]}/>
                      <Bar dataKey="unmatched" name="Unmatched" fill="#F87171" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ):<div style={{color:"#475569",textAlign:"center",padding:40}}>No date data</div>}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Match Distribution</div>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                      {pieData.map((e,i)=><Cell key={i} fill={MC[e.name]?.color||"#64748B"}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[v+" records",n]} contentStyle={{background:"#0D1424",border:"1px solid #1E2D45",fontSize:11}}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {pieData.map((d,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:7,height:7,borderRadius:1,background:MC[d.name]?.color,flexShrink:0}}/>
                      <span style={{fontSize:10,color:"#64748B",flex:1}}>{d.name}</span>
                      <span style={{fontFamily:"monospace",fontSize:10,color:MC[d.name]?.color,fontWeight:700}}>{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>ITC Position Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                {[
                  {label:"Eligible ITC (Confirmed)",value:stats.eligibleITC,color:"#10B981",sub:"Exact + probable matches",section:"eligible"},
                  {label:"ITC at Risk",value:stats.riskITC,color:"#F59E0B",sub:"Value mismatches",section:"atRisk"},
                  {label:"Blocked ITC (Not in 2B)",value:stats.missing2B,color:"#F87171",sub:"Vendor hasn't uploaded 2B",section:"blocked"},
                  {label:"Unbooked ITC (2B > Books)",value:stats.missingBk,color:"#FB923C",sub:"Not recorded in books",section:"unbooked"},
                  {label:"Duplicate ITC Exposure",value:stats.dupTV,color:"#E879F9",sub:"Possible double claims",section:"duplicate"},
                ].map(({label,value,color,sub,section})=>(
                  <div key={label} onClick={()=>{setItcSection(section);setTab("itc");}} style={{background:"#070B14",borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${color}`,cursor:"pointer",transition:"transform 0.15s, box-shadow 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 4px 16px ${color}20`;}}
                    onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="none";}}
                  >
                    <div style={{fontSize:9,color:"#475569",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.04em"}}>{label}</div>
                    <div style={{fontSize:18,fontWeight:700,color,fontFamily:"monospace"}}>{inrFmt(value,true)}</div>
                    <div style={{fontSize:9,color:"#334155",marginTop:3}}>{sub}</div>
                    <div style={{fontSize:8,color,marginTop:6,opacity:0.6}}>Click to view details →</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ ITC AVAILABLE ══ */}
        {tab==="itc"&&itcStats&&(
          <div>
            <div style={{marginBottom:20}}>
              <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px",color:"#E2E8F0"}}>ITC Available Analysis</h2>
              <p style={{fontSize:11,color:"#64748B",margin:0}}>Comprehensive breakdown of Input Tax Credit eligibility based on reconciliation results</p>
            </div>
            {/* Summary cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              <div style={{background:"linear-gradient(135deg,#0c1a35,#0D1424)",border:"1px solid #3B82F630",borderRadius:12,padding:"18px 20px"}}>
                <div style={{fontSize:9,color:"#64748B",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total ITC as per Books</div>
                <div style={{fontSize:24,fontWeight:700,color:"#3B82F6",fontFamily:"monospace"}}>{inrFmt(itcStats.totalBooksITC,true)}</div>
                <div style={{fontSize:9,color:"#475569",marginTop:4}}>Sum of all tax in purchase register</div>
              </div>
              <div style={{background:"linear-gradient(135deg,#150d26,#0D1424)",border:"1px solid #8B5CF630",borderRadius:12,padding:"18px 20px"}}>
                <div style={{fontSize:9,color:"#64748B",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total ITC as per GSTR-2B</div>
                <div style={{fontSize:24,fontWeight:700,color:"#8B5CF6",fontFamily:"monospace"}}>{inrFmt(itcStats.totalTwoBITC,true)}</div>
                <div style={{fontSize:9,color:"#475569",marginTop:4}}>Auto-drafted ITC from GST portal</div>
              </div>
              <div style={{background:"linear-gradient(135deg,#052e1c,#0D1424)",border:"1px solid #10B98130",borderRadius:12,padding:"18px 20px"}}>
                <div style={{fontSize:9,color:"#64748B",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>✅ Final Eligible ITC</div>
                <div style={{fontSize:24,fontWeight:700,color:"#10B981",fontFamily:"monospace"}}>{inrFmt(itcStats.eligibleITC,true)}</div>
                <div style={{fontSize:9,color:"#475569",marginTop:4}}>Exact + Date match + Approved</div>
              </div>
              <div style={{background:"linear-gradient(135deg,#1c1005,#0D1424)",border:"1px solid #F59E0B30",borderRadius:12,padding:"18px 20px"}}>
                <div style={{fontSize:9,color:"#64748B",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Net ITC Difference</div>
                <div style={{fontSize:24,fontWeight:700,color:Math.abs(itcStats.totalBooksITC-itcStats.totalTwoBITC)<1?"#475569":itcStats.totalBooksITC>itcStats.totalTwoBITC?"#F87171":"#10B981",fontFamily:"monospace"}}>
                  {itcStats.totalBooksITC>itcStats.totalTwoBITC?"▲":"▼"}{inrFmt(Math.abs(itcStats.totalBooksITC-itcStats.totalTwoBITC),true)}
                </div>
                <div style={{fontSize:9,color:"#475569",marginTop:4}}>Books {itcStats.totalBooksITC>itcStats.totalTwoBITC?"higher":"lower"} than 2B</div>
              </div>
            </div>
            {/* Approved ITC breakdown bar */}
            <div style={{...S.card,marginBottom:20,padding:"16px 20px"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <Shield size={16} style={{color:"#10B981"}}/>
                <div style={{fontSize:13,fontWeight:700,color:"#E2E8F0"}}>ITC Eligibility Breakdown</div>
                <div style={{marginLeft:"auto",fontSize:10,color:"#475569"}}>
                  Approved as per Books: <span style={{color:"#3B82F6",fontFamily:"monospace",fontWeight:700}}>{inrFmt(itcStats.totalBooksITC,true)}</span>
                  <span style={{margin:"0 8px",color:"#334155"}}>|</span>
                  Approved as per 2B: <span style={{color:"#8B5CF6",fontFamily:"monospace",fontWeight:700}}>{inrFmt(itcStats.totalTwoBITC,true)}</span>
                </div>
              </div>
              <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",background:"#1E2D45",gap:1}}>
                {[
                  {val:itcStats.eligibleITC,col:"#10B981"},{val:itcStats.probableITC,col:"#60A5FA"},
                  {val:itcStats.atRiskITC,col:"#F59E0B"},{val:itcStats.blockedITC,col:"#F87171"},
                  {val:itcStats.unbookedITC,col:"#FB923C"},{val:itcStats.dupITC,col:"#E879F9"},
                ].map(({val,col},i)=>{
                  const total=itcStats.eligibleITC+itcStats.probableITC+itcStats.atRiskITC+itcStats.blockedITC+itcStats.unbookedITC+itcStats.dupITC;
                  const pct=total?((val/total)*100):0;
                  return pct>0?<div key={i} style={{width:`${pct}%`,background:col,borderRadius:1,minWidth:pct>0?2:0,transition:"width 0.3s"}}/>:null;
                })}
              </div>
              <div style={{display:"flex",gap:16,marginTop:10,flexWrap:"wrap"}}>
                {[
                  {label:"Eligible",val:itcStats.eligibleITC,col:"#10B981"},{label:"Probable",val:itcStats.probableITC,col:"#60A5FA"},
                  {label:"At Risk",val:itcStats.atRiskITC,col:"#F59E0B"},{label:"Blocked",val:itcStats.blockedITC,col:"#F87171"},
                  {label:"Unbooked",val:itcStats.unbookedITC,col:"#FB923C"},{label:"Duplicate",val:itcStats.dupITC,col:"#E879F9"},
                ].map(({label,val,col})=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:8,height:8,borderRadius:2,background:col}}/>
                    <span style={{fontSize:10,color:"#64748B"}}>{label}:</span>
                    <span style={{fontSize:10,color:col,fontFamily:"monospace",fontWeight:700}}>{inrFmt(val,true)}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Category sections */}
            {[
              {key:"eligible",title:"Eligible ITC (Confirmed)",icon:<CheckCircle size={16}/>,color:"#10B981",bg:"#052e1c",border:"#10B98130",tax:itcStats.eligibleITC,tv:itcStats.eligibleTV,items:itcStats.allEligible,
                desc:"Matched between Books & 2B — includes exact matches, date mismatches (amounts match), and manually approved invoices.",
                action:"No action required — ITC is fully eligible for claim in GSTR-3B.",bk:true,tb:true,
                subGroups:[
                  {label:"Exact Match",items:itcStats.cats.eligible,color:"#10B981"},
                  {label:"Date Mismatch (Amounts Match)",items:itcStats.cats.dateMismatchEligible,color:"#A78BFA"},
                  {label:"Manually Approved",items:itcStats.cats.approvedMismatch,color:"#60A5FA"},
                  {label:"Value Approved",items:itcStats.cats.valueApproved,color:"#F59E0B"},
                ]},
              {key:"clubbed",title:"Clubbed Invoices (Multi-Rate)",icon:<Zap size={16}/>,color:"#06B6D4",bg:"#052e2e",border:"#06B6D430",tax:itcStats.clubbedITC,tv:itcStats.clubbedTV,items:itcStats.cats.clubbed,
                desc:"Same invoice number with different GST rates — line items clubbed together automatically.",
                action:"These are valid multi-rate invoices. Verify that all line items belong to the same invoice.",bk:true,tb:true},
              {key:"probable",title:"Probable ITC (High Confidence)",icon:<AlertCircle size={16}/>,color:"#60A5FA",bg:"#0c1a35",border:"#60A5FA30",tax:itcStats.probableITC,tv:itcStats.probableTV,items:itcStats.cats.probable,
                desc:"Invoice number is a fuzzy match but amounts match.",
                action:"Verify invoice number with vendor. Once confirmed, approve to move to Eligible ITC.",bk:true,tb:true},
              {key:"atRisk",title:"ITC at Risk (Value Mismatch)",icon:<AlertTriangle size={16}/>,color:"#F59E0B",bg:"#1c1005",border:"#F59E0B30",tax:itcStats.atRiskITC,tv:itcStats.atRiskTV,items:itcStats.cats.atRisk,
                desc:"Invoice found in both sources but tax/taxable values differ. Select which amount to approve.",
                action:"Select Books or 2B amount per invoice. If Books > 2B, a warning will appear. Approved amount moves to Eligible ITC.",bk:true,tb:true,isValueMismatch:true},
              {key:"blocked",title:"Blocked ITC (Not in GSTR-2B)",icon:<XCircle size={16}/>,color:"#F87171",bg:"#2d0808",border:"#F8717130",tax:itcStats.blockedITC,tv:itcStats.blockedTV,items:itcStats.cats.blocked,
                desc:"Recorded in books but vendor hasn't uploaded GSTR-1.",
                action:"Follow up with vendor to file GSTR-1. Cannot claim until it reflects in 2B.",bk:true,tb:false},
              {key:"unbooked",title:"Unbooked ITC (Available in 2B, Not in Books)",icon:<AlertTriangle size={16}/>,color:"#FB923C",bg:"#2d1005",border:"#FB923C30",tax:itcStats.unbookedITC,tv:itcStats.unbookedTV,items:itcStats.cats.unbooked,
                desc:"Available in GSTR-2B but not recorded in your purchase register.",
                action:"Record these invoices in your books. Once booked, ITC can be claimed.",bk:false,tb:true},
              {key:"duplicate",title:"Duplicate ITC Exposure",icon:<Copy size={16}/>,color:"#E879F9",bg:"#25081a",border:"#E879F930",tax:itcStats.dupITC,tv:itcStats.dupTV,items:itcStats.cats.duplicate,
                desc:"True duplicate entries detected. Risk of excess ITC claim.",
                action:"Review books entries and remove duplicates. Only one entry should be claimed.",bk:true,tb:true},
            ].map(cat=>{
              const isOpen=itcSection===cat.key;
              return(
                <div key={cat.key} style={{marginBottom:12}}>
                  {/* Section header */}
                  <div onClick={()=>setItcSection(isOpen?null:cat.key)} style={{background:cat.bg,border:`1px solid ${cat.border}`,borderRadius:isOpen?"12px 12px 0 0":12,padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all 0.15s"}}>
                    <div style={{color:cat.color,display:"flex",alignItems:"center"}}>{isOpen?<ChevronDown size={18}/>:<ChevronRight size={18}/>}</div>
                    <div style={{color:cat.color,display:"flex",alignItems:"center"}}>{cat.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:cat.color}}>{cat.title}</div>
                      <div style={{fontSize:10,color:"#475569",marginTop:2}}>{cat.desc}</div>
                    </div>
                    <div style={{textAlign:"right",marginRight:16}}>
                      <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>Taxable Value</div>
                      <div style={{fontSize:16,fontWeight:700,color:cat.color,fontFamily:"monospace"}}>{inrFmt(cat.tv,true)}</div>
                    </div>
                    <div style={{textAlign:"right",marginRight:8}}>
                      <div style={{fontSize:9,color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em"}}>Tax (ITC)</div>
                      <div style={{fontSize:16,fontWeight:700,color:cat.color,fontFamily:"monospace"}}>{inrFmt(cat.tax,true)}</div>
                    </div>
                    <div style={{background:`${cat.color}20`,color:cat.color,border:`1px solid ${cat.border}`,borderRadius:20,padding:"3px 12px",fontSize:11,fontWeight:700,minWidth:30,textAlign:"center"}}>{cat.items.length}</div>
                  </div>
                  {/* Expanded content */}
                  {isOpen&&(
                    <div style={{background:"#0D1424",border:`1px solid ${cat.border}`,borderTop:"none",borderRadius:"0 0 12px 12px",overflow:"hidden"}}>
                      {/* Action guidance */}
                      <div style={{padding:"12px 20px",background:`${cat.color}08`,borderBottom:`1px solid ${cat.border}`,display:"flex",alignItems:"center",gap:10}}>
                        <Info size={14} style={{color:cat.color,flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:10,fontWeight:700,color:cat.color,marginBottom:2}}>Action Required</div>
                          <div style={{fontSize:11,color:"#94A3B8"}}>{cat.action}</div>
                        </div>
                      </div>
                      {/* Sub-group badges for eligible */}
                      {cat.subGroups&&<div style={{padding:"12px 20px",display:"flex",gap:10,flexWrap:"wrap",borderBottom:"1px solid #1E2D4530"}}>
                        {cat.subGroups.filter(sg=>sg.items.length>0).map(sg=>(
                          <div key={sg.label} style={{background:`${sg.color}12`,border:`1px solid ${sg.color}30`,borderRadius:8,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:8,height:8,borderRadius:2,background:sg.color}}/>
                            <div>
                              <div style={{fontSize:10,fontWeight:700,color:sg.color}}>{sg.label}</div>
                              <div style={{fontSize:9,color:"#475569"}}>{sg.items.length} invoices · {inrFmt(sg.items.reduce((s,r)=>s+r.tTX,0),true)} tax</div>
                            </div>
                          </div>
                        ))}
                      </div>}
                      {/* Summary totals */}
                      <div style={{padding:"14px 20px",display:"flex",gap:20,borderBottom:"1px solid #1E2D4530"}}>
                        {cat.bk&&<div style={{background:"#070B14",borderRadius:8,padding:"10px 16px",borderTop:"2px solid #3B82F6",flex:1}}>
                          <div style={{fontSize:9,fontWeight:700,color:"#3B82F6",marginBottom:4,textTransform:"uppercase"}}>Books Total</div>
                          <div style={{display:"flex",gap:20}}>
                            <div><div style={{fontSize:9,color:"#475569"}}>Taxable</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(cat.items.reduce((s,r)=>s+r.bTV,0))}</div></div>
                            <div><div style={{fontSize:9,color:"#475569"}}>Tax</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(cat.items.reduce((s,r)=>s+r.bTX,0))}</div></div>
                          </div>
                        </div>}
                        {cat.tb&&<div style={{background:"#070B14",borderRadius:8,padding:"10px 16px",borderTop:"2px solid #8B5CF6",flex:1}}>
                          <div style={{fontSize:9,fontWeight:700,color:"#8B5CF6",marginBottom:4,textTransform:"uppercase"}}>GSTR-2B Total</div>
                          <div style={{display:"flex",gap:20}}>
                            <div><div style={{fontSize:9,color:"#475569"}}>Taxable</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(cat.items.reduce((s,r)=>s+r.tTV,0))}</div></div>
                            <div><div style={{fontSize:9,color:"#475569"}}>Tax</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(cat.items.reduce((s,r)=>s+r.tTX,0))}</div></div>
                          </div>
                        </div>}
                      </div>
                      {/* Invoice table */}
                      {cat.items.length>0?(
                        <div style={{overflowX:"auto"}}>
                          <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"monospace"}}>
                            <thead><tr style={{background:"#070B14",borderBottom:"1px solid #1E2D45"}}>
                              <th style={{padding:"8px 10px",textAlign:"left",color:"#475569",fontSize:9}}>#</th>
                              <th style={{padding:"8px 10px",textAlign:"left",color:"#475569",fontSize:9}}>Type</th>
                              <th style={{padding:"8px 10px",textAlign:"left",color:"#475569",fontSize:9}}>Supplier</th>
                              <th style={{padding:"8px 10px",textAlign:"left",color:"#475569",fontSize:9}}>GSTIN</th>
                              {cat.bk&&<><th style={{padding:"8px 10px",textAlign:"left",color:"#3B82F6",fontSize:9}}>Invoice (Books)</th>
                              <th style={{padding:"8px 10px",textAlign:"right",color:"#3B82F6",fontSize:9}}>Taxable (Books)</th>
                              <th style={{padding:"8px 10px",textAlign:"right",color:"#3B82F6",fontSize:9}}>Tax (Books)</th></>}
                              {cat.tb&&<><th style={{padding:"8px 10px",textAlign:"left",color:"#8B5CF6",fontSize:9}}>Invoice (2B)</th>
                              <th style={{padding:"8px 10px",textAlign:"right",color:"#8B5CF6",fontSize:9}}>Taxable (2B)</th>
                              <th style={{padding:"8px 10px",textAlign:"right",color:"#8B5CF6",fontSize:9}}>Tax (2B)</th></>}
                              {cat.bk&&cat.tb&&<th style={{padding:"8px 10px",textAlign:"right",color:"#475569",fontSize:9}}>Δ Tax</th>}
                              {cat.key==="clubbed"&&<th style={{padding:"8px 10px",textAlign:"center",color:"#06B6D4",fontSize:9}}>Parts</th>}
                              {cat.isValueMismatch&&<th style={{padding:"8px 10px",textAlign:"center",color:"#F59E0B",fontSize:9}}>Approve</th>}
                              {(cat.key==="probable"||cat.key==="blocked"||cat.key==="unbooked"||cat.key==="duplicate")&&<th style={{padding:"8px 10px",textAlign:"center",color:"#475569",fontSize:9}}>Review</th>}
                              <th style={{padding:"8px 10px",textAlign:"center",color:"#475569",fontSize:9}}>Conf</th>
                            </tr></thead>
                            <tbody>
                              {cat.items.map((r,j)=>{
                                const d=r.bTX-r.tTX;
                                const dc=Math.abs(d)<1?"#475569":d>0?"#F87171":"#10B981";
                                const va=valueApprovals[r.id];
                                // Sub-group color dot for eligible
                                const sgColor=cat.subGroups?(r.type==="Exact Match"?"#10B981":r.type==="Date Mismatch"?"#A78BFA":va?"#F59E0B":"#60A5FA"):null;
                                return(<>
                                  <tr key={j} style={{borderBottom:"1px solid #1E2D4520",background:j%2===0?"transparent":"#0A0F1C"}}>
                                    <td style={{padding:"6px 10px",color:"#334155",display:"flex",alignItems:"center",gap:4}}>
                                      {sgColor&&<div style={{width:6,height:6,borderRadius:1,background:sgColor,flexShrink:0}}/>}{j+1}
                                    </td>
                                    <td style={{padding:"6px 10px"}}><Badge type={r.type}/></td>
                                    <td style={{padding:"6px 10px",color:"#94A3B8",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.bName}>{r.bName||"—"}</td>
                                    <td style={{padding:"6px 10px",color:"#64748B",fontSize:9}}>{(r.bG||r.tG||"—").slice(0,15)}</td>
                                    {cat.bk&&<><td style={{padding:"6px 10px",color:"#CBD5E1"}}>{r.bI||"—"}{r.isClubbed&&<span style={{marginLeft:4,background:"#06B6D420",color:"#06B6D4",border:"1px solid #06B6D430",borderRadius:3,padding:"1px 4px",fontSize:8,fontWeight:700}}>{r.bCnt}×</span>}</td>
                                    <td style={{padding:"6px 10px",color:"#94A3B8",textAlign:"right"}}>{r.bTV?inrFmt(r.bTV):"—"}</td>
                                    <td style={{padding:"6px 10px",color:"#CBD5E1",textAlign:"right",fontWeight:600}}>{r.bTX?inrFmt(r.bTX):"—"}</td></>}
                                    {cat.tb&&<><td style={{padding:"6px 10px",color:r.tI&&r.bI&&normalizeInv(r.tI)!==normalizeInv(r.bI)?"#A78BFA":"#CBD5E1"}}>{r.tI||"—"}</td>
                                    <td style={{padding:"6px 10px",color:"#94A3B8",textAlign:"right"}}>{r.tTV?inrFmt(r.tTV):"—"}</td>
                                    <td style={{padding:"6px 10px",color:"#CBD5E1",textAlign:"right",fontWeight:600}}>{r.tTX?inrFmt(r.tTX):"—"}</td></>}
                                    {cat.bk&&cat.tb&&<td style={{padding:"6px 10px",textAlign:"right",color:dc,fontWeight:Math.abs(d)>0.5?700:400}}>{Math.abs(d)>0.5?(d>0?"▲":"▼")+inrFmt(Math.abs(d)):"—"}</td>}
                                    {cat.key==="clubbed"&&<td style={{padding:"6px 10px",textAlign:"center"}}>
                                      <span style={{background:"#06B6D420",color:"#06B6D4",border:"1px solid #06B6D430",borderRadius:4,padding:"2px 6px",fontSize:9,fontWeight:700}}>{r.clubbedParts?.length||r.bCnt} line items</span>
                                    </td>}
                                    {cat.isValueMismatch&&<td style={{padding:"6px 10px",textAlign:"center",whiteSpace:"nowrap"}}>
                                      <div style={{display:"flex",gap:3,justifyContent:"center"}}>
                                        <button onClick={(e)=>{e.stopPropagation();if(r.bTX>r.tTX&&!confirm(`⚠️ Books amount (${inrFmt(r.bTX)}) is HIGHER than 2B (${inrFmt(r.tTX)}). This may be questioned during audit. Continue?`))return;setValueApprovals(p=>({...p,[r.id]:{source:"books",approvedTax:r.bTX,approvedTV:r.bTV}}));updateReview(r.id,"approved");}}
                                          style={{cursor:"pointer",background:va?.source==="books"?"#0c1a35":"transparent",color:va?.source==="books"?"#3B82F6":"#475569",border:`1px solid ${va?.source==="books"?"#3B82F640":"#1E2D45"}`,borderRadius:4,padding:"3px 8px",fontSize:9,fontFamily:"inherit",fontWeight:600}}>Books</button>
                                        <button onClick={(e)=>{e.stopPropagation();setValueApprovals(p=>({...p,[r.id]:{source:"2b",approvedTax:r.tTX,approvedTV:r.tTV}}));updateReview(r.id,"approved");}}
                                          style={{cursor:"pointer",background:va?.source==="2b"?"#150d26":"transparent",color:va?.source==="2b"?"#8B5CF6":"#475569",border:`1px solid ${va?.source==="2b"?"#8B5CF640":"#1E2D45"}`,borderRadius:4,padding:"3px 8px",fontSize:9,fontFamily:"inherit",fontWeight:600}}>2B</button>
                                      </div>
                                      {va&&<div style={{fontSize:8,color:va.source==="books"&&r.bTX>r.tTX?"#F87171":"#10B981",marginTop:2}}>{va.source==="books"&&r.bTX>r.tTX?"⚠ Higher than 2B":"✓ "+inrFmt(va.approvedTax,true)}</div>}
                                    </td>}
                                    {(cat.key==="probable"||cat.key==="blocked"||cat.key==="unbooked"||cat.key==="duplicate")&&<td style={{padding:"6px 10px",textAlign:"center",whiteSpace:"nowrap"}}>
                                      <div style={{display:"flex",gap:3,justifyContent:"center"}}>
                                        <button onClick={(e)=>{e.stopPropagation();updateReview(r.id,"approved");}}
                                          style={{cursor:"pointer",background:r.reviewStatus==="approved"?"#052e1c":"transparent",color:r.reviewStatus==="approved"?"#10B981":"#475569",border:`1px solid ${r.reviewStatus==="approved"?"#10B98140":"#1E2D45"}`,borderRadius:4,padding:"3px 6px",fontSize:9,fontFamily:"inherit",fontWeight:600,display:"inline-flex",alignItems:"center",gap:2}}><ThumbsUp size={9}/></button>
                                        <button onClick={(e)=>{e.stopPropagation();updateReview(r.id,"flagged");}}
                                          style={{cursor:"pointer",background:r.reviewStatus==="flagged"?"#2d0808":"transparent",color:r.reviewStatus==="flagged"?"#F87171":"#475569",border:`1px solid ${r.reviewStatus==="flagged"?"#F8717140":"#1E2D45"}`,borderRadius:4,padding:"3px 6px",fontSize:9,fontFamily:"inherit",fontWeight:600,display:"inline-flex",alignItems:"center",gap:2}}><ThumbsDown size={9}/></button>
                                      </div>
                                      {r.reviewStatus!=="pending"&&<div style={{fontSize:8,color:r.reviewStatus==="approved"?"#10B981":"#F87171",marginTop:2}}>{r.reviewStatus==="approved"?"✓ Approved":"⚑ Flagged"}</div>}
                                    </td>}
                                    <td style={{padding:"6px 10px",textAlign:"center"}}><ConfBar value={r.conf}/></td>
                                  </tr>
                                  {/* Clubbed parts sub-rows */}
                                  {cat.key==="clubbed"&&r.clubbedParts&&r.clubbedParts.length>1&&r.clubbedParts.map((p,pi)=>(
                                    <tr key={`${j}_p${pi}`} style={{background:"#070B1480",borderBottom:"1px solid #1E2D4510"}}>
                                      <td style={{padding:"4px 10px 4px 24px",color:"#334155",fontSize:9}}>↳ {pi+1}</td>
                                      <td colSpan={2} style={{padding:"4px 10px",color:"#475569",fontSize:9}}>Line item {pi+1}</td>
                                      <td style={{padding:"4px 10px"}}/>
                                      {cat.bk&&<><td style={{padding:"4px 10px"}}/>
                                      <td style={{padding:"4px 10px",color:"#64748B",textAlign:"right",fontSize:9}}>{inrFmt(p.taxable_value)}</td>
                                      <td style={{padding:"4px 10px",color:"#64748B",textAlign:"right",fontSize:9}}>{inrFmt(p.cgst+p.sgst+p.igst)}</td></>}
                                      {cat.tb&&<><td colSpan={3}/></>}
                                      {cat.bk&&cat.tb&&<td/>}
                                      <td style={{padding:"4px 10px",textAlign:"center",fontSize:9,color:"#475569"}}>
                                        {p.cgst?"C:"+inrFmt(p.cgst,true):""} {p.sgst?"S:"+inrFmt(p.sgst,true):""} {p.igst?"I:"+inrFmt(p.igst,true):""}
                                      </td>
                                      <td/>
                                    </tr>
                                  ))}
                                </>);
                              })}
                            </tbody>
                          </table>
                        </div>
                      ):<div style={{padding:40,textAlign:"center",color:"#475569",fontSize:11}}>No invoices in this category</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ RESULTS ══ */}
        {tab==="results"&&enriched.length>0&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                <Search size={12} style={{position:"absolute",left:9,color:"#475569"}}/>
                <input placeholder="Search GSTIN · Invoice · Vendor…" value={search} onChange={e=>setSearch(e.target.value)} style={{...S.input,width:230}}/>
              </div>
              <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                <Calendar size={12} style={{position:"absolute",left:9,color:"#475569"}}/>
                <select value={monthFilter} onChange={e=>setMonthFilter(e.target.value)} style={{...S.input,width:140,cursor:"pointer"}}>
                  {monthOptions.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <span style={{...S.mono,color:"#475569"}}>{filtered.length} of {stats?.total} records</span>
              <div style={{marginLeft:"auto",display:"flex",gap:8}}>
                <button style={S.ghostBtn} onClick={()=>downloadCSV(filtered,"itc_filtered.csv")}><Download size={12}/> Export Filtered</button>
                <button style={S.ghostBtn} onClick={()=>downloadCSV(enriched,"itc_full_reconciliation.csv")}><Download size={12}/> Export All ({stats?.total})</button>
              </div>
            </div>
            <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
              {["All",...Object.keys(MC)].map(f=>{
                const count=f==="All"?stats?.total:(stats?.counts[f]||0);
                const col=f==="All"?"#60A5FA":(MC[f]?.color||"#64748B");
                if(f!=="All"&&!count)return null;
                return<button key={f} style={S.pill(filter===f,col)} onClick={()=>setFilter(f)}>{f} ({count})</button>;
              })}
            </div>

            {/* Export notice */}
            <div style={{background:"#0c1a35",border:"1px solid #60A5FA30",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:10,color:"#60A5FA",display:"flex",gap:8,alignItems:"center"}}>
              <Info size={12}/>
              Exported CSV includes {">"}30 columns: supplier name, GSTIN validation, all tax components (CGST/SGST/IGST), taxable value, delta variance, date difference, invoice similarity %, ITC claimability, and action required — for every record.
            </div>

            <div style={{background:"#0D1424",border:"1px solid #1E2D45",borderRadius:12,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,fontFamily:"monospace"}}>
                  <thead>
                    <tr style={{background:"#070B14",borderBottom:"1px solid #1E2D45"}}>
                      {["#","Type","Conf","Supplier","GSTIN (Books)","Invoice (Books)","Date (Books)","Taxable (Bk)","CGST","SGST","IGST","Tax (Books)","Invoice (2B)","Date (2B)","Tax (2B)","Δ Tax","Split","✓","Review","Actions"].map(h=>(
                        <th key={h} style={{padding:"9px 10px",textAlign:"left",fontWeight:600,color:"#475569",whiteSpace:"nowrap",fontSize:9,letterSpacing:"0.04em"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r,i)=>{
                      const delta=r.bTX&&r.tTX?r.bTX-r.tTX:0;
                      const dc=Math.abs(delta)<1?"#475569":delta>0?"#F87171":"#10B981";
                      return(
                        <tr key={r.id} style={{borderBottom:"1px solid #1E2D4530",background:i%2===0?"transparent":"#0A0F1C"}}>
                          <td style={{padding:"7px 10px",color:"#334155"}}>{i+1}</td>
                          <td style={{padding:"7px 10px",whiteSpace:"nowrap"}}><Badge type={r.type}/></td>
                          <td style={{padding:"7px 10px"}}><ConfBar value={r.conf}/></td>
                          <td style={{padding:"7px 10px",color:"#94A3B8",maxWidth:110,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.bName}>{r.bName||"—"}</td>
                          <td style={{padding:"7px 10px",color:r.gstinValid===false&&r.bG?"#F87171":"#64748B",fontSize:10}} title={r.bG}>{r.bG?.slice(0,15)||"—"}</td>
                          <td style={{padding:"7px 10px",color:"#CBD5E1"}}>{r.bI||"—"}</td>
                          <td style={{padding:"7px 10px",color:"#64748B"}}>{r.bD||"—"}</td>
                          <td style={{padding:"7px 10px",color:"#94A3B8",textAlign:"right"}}>{r.bTV?inrFmt(r.bTV,true):"—"}</td>
                          <td style={{padding:"7px 10px",color:"#64748B",textAlign:"right"}}>{r.bCG?inrFmt(r.bCG,true):"—"}</td>
                          <td style={{padding:"7px 10px",color:"#64748B",textAlign:"right"}}>{r.bSG?inrFmt(r.bSG,true):"—"}</td>
                          <td style={{padding:"7px 10px",color:"#64748B",textAlign:"right"}}>{r.bIG?inrFmt(r.bIG,true):"—"}</td>
                          <td style={{padding:"7px 10px",color:"#CBD5E1",textAlign:"right",fontWeight:600}}>{r.bTX?inrFmt(r.bTX,true):"—"}</td>
                          <td style={{padding:"7px 10px",color:r.tI&&r.bI&&normalizeInv(r.tI)!==normalizeInv(r.bI)?"#A78BFA":"#CBD5E1"}}>{r.tI||"—"}</td>
                          <td style={{padding:"7px 10px",color:r.bD&&r.tD&&r.bD!==r.tD?"#A78BFA":"#64748B"}}>{r.tD||"—"}</td>
                          <td style={{padding:"7px 10px",color:"#CBD5E1",textAlign:"right",fontWeight:600}}>{r.tTX?inrFmt(r.tTX,true):"—"}</td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:dc,fontWeight:Math.abs(delta)>0.5?700:400}}>{Math.abs(delta)>0.5?(delta>0?"▲":"▼")+inrFmt(Math.abs(delta),true):"—"}</td>
                          <td style={{padding:"7px 10px",textAlign:"center"}}>{r.bCnt>1?<span style={{background:"#25081a",color:"#E879F9",border:"1px solid #E879F930",borderRadius:4,padding:"1px 5px",fontWeight:700}}>{r.bCnt}×</span>:<span style={{color:"#334155"}}>1</span>}</td>
                          <td style={{padding:"7px 10px",textAlign:"center"}}>{r.bG?(r.gstinValid?<CheckCircle size={12} color="#10B981"/>:<XCircle size={12} color="#F87171"/>):<span style={{color:"#334155"}}>—</span>}</td>
                          <td style={{padding:"7px 10px"}}><StatusChip status={r.reviewStatus}/></td>
                          <td style={{padding:"7px 6px",whiteSpace:"nowrap"}}>
                            <div style={{display:"flex",gap:3,alignItems:"center"}}>
                              <button
                                title="Approve"
                                onClick={()=>updateReview(r.id,"approved")}
                                style={{cursor:"pointer",background:r.reviewStatus==="approved"?"#052e1c":"transparent",color:r.reviewStatus==="approved"?"#10B981":"#334155",border:`1px solid ${r.reviewStatus==="approved"?"#10B98140":"#1E2D45"}`,borderRadius:5,padding:"4px 6px",display:"inline-flex",alignItems:"center",gap:3,fontSize:9,fontFamily:"inherit",fontWeight:600}}
                              >
                                <ThumbsUp size={10}/>
                              </button>
                              <button
                                title="Flag"
                                onClick={()=>updateReview(r.id,"flagged")}
                                style={{cursor:"pointer",background:r.reviewStatus==="flagged"?"#2d0808":"transparent",color:r.reviewStatus==="flagged"?"#F87171":"#334155",border:`1px solid ${r.reviewStatus==="flagged"?"#F8717140":"#1E2D45"}`,borderRadius:5,padding:"4px 6px",display:"inline-flex",alignItems:"center",gap:3,fontSize:9,fontFamily:"inherit",fontWeight:600}}
                              >
                                <ThumbsDown size={10}/>
                              </button>
                              <button
                                title="Edit Note"
                                onClick={()=>setEditingNoteId(editingNoteId===r.id?null:r.id)}
                                style={{cursor:"pointer",background:editingNoteId===r.id?"#0c1a35":((reviewItems[r.id]?.note)?"#0c1a3580":"transparent"),color:editingNoteId===r.id?"#60A5FA":((reviewItems[r.id]?.note)?"#60A5FA":"#334155"),border:`1px solid ${editingNoteId===r.id?"#60A5FA40":"#1E2D45"}`,borderRadius:5,padding:"4px 6px",display:"inline-flex",alignItems:"center",gap:3,fontSize:9,fontFamily:"inherit",fontWeight:600}}
                              >
                                <Edit3 size={10}/>
                              </button>
                            </div>
                            {editingNoteId===r.id&&(
                              <div style={{position:"absolute",right:10,marginTop:4,background:"#0D1424",border:"1px solid #1E2D45",borderRadius:8,padding:10,zIndex:100,width:260,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}
                                onClick={e=>e.stopPropagation()}
                              >
                                <div style={{fontSize:9,color:"#64748B",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:700}}>Review Note</div>
                                <textarea
                                  placeholder="Write a note about this entry…"
                                  value={noteInput[r.id]??(reviewItems[r.id]?.note)??""}
                                  onChange={e=>setNoteInput(prev=>({...prev,[r.id]:e.target.value}))}
                                  style={{width:"100%",background:"#070B14",border:"1px solid #1E2D45",borderRadius:6,padding:"6px 8px",color:"#CBD5E1",fontFamily:"inherit",fontSize:11,outline:"none",resize:"vertical",minHeight:50,boxSizing:"border-box"}}
                                />
                                <div style={{display:"flex",gap:6,marginTop:6,justifyContent:"flex-end"}}>
                                  <button
                                    style={{cursor:"pointer",background:"transparent",color:"#64748B",border:"1px solid #1E2D45",borderRadius:5,padding:"4px 10px",fontSize:10,fontFamily:"inherit",fontWeight:600}}
                                    onClick={()=>{setEditingNoteId(null);setNoteInput(prev=>{const n={...prev};delete n[r.id];return n;});}}
                                  >Cancel</button>
                                  <button
                                    style={{cursor:"pointer",background:"#1D6EE8",color:"#fff",border:"none",borderRadius:5,padding:"4px 10px",fontSize:10,fontFamily:"inherit",fontWeight:600}}
                                    onClick={()=>{updateReview(r.id,reviewItems[r.id]?.status||"pending",noteInput[r.id]??"");setEditingNoteId(null);}}
                                  >Save</button>
                                </div>
                                {(reviewItems[r.id]?.note)&&!(noteInput[r.id]!=null)&&<div style={{fontSize:9,color:"#475569",marginTop:6,fontStyle:"italic",borderTop:"1px solid #1E2D45",paddingTop:6}}>Current: {reviewItems[r.id].note}</div>}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length===0&&<div style={{padding:48,textAlign:"center",color:"#475569"}}><Search size={24} style={{margin:"0 auto 10px",opacity:0.3}}/><div>No records match</div></div>}
              </div>
            </div>
            <div style={{marginTop:10,padding:"8px 14px",background:"#0D1424",border:"1px solid #1E2D45",borderRadius:8,display:"flex",gap:16,flexWrap:"wrap",alignItems:"center",fontSize:10}}>
              <span style={{color:"#475569",textTransform:"uppercase",letterSpacing:"0.04em",fontWeight:700}}>Legend:</span>
              <span style={{color:"#F87171"}}>▲ Books &gt; 2B</span><span style={{color:"#10B981"}}>▼ 2B &gt; Books</span>
              <span style={{color:"#A78BFA"}}>Purple = invoice / date differs</span>
              <span style={{color:"#F87171",marginLeft:"auto"}}>Red GSTIN = invalid format</span>
            </div>
          </div>
        )}

        {/* ══ VENDOR ANALYSIS ══ */}
        {tab==="vendors"&&vendorStats.length>0&&(
          <div>
            <div style={{display:"flex",alignItems:"flex-end",marginBottom:20}}>
              <div>
                <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px",color:"#E2E8F0"}}>Party-wise Reconciliation</h2>
                <p style={{fontSize:11,color:"#64748B",margin:0}}>{vendorStats.length} unique suppliers — click a row to view invoice-level comparison</p>
              </div>
              <button style={{...S.ghostBtn,marginLeft:"auto"}} onClick={()=>downloadCSV(enriched,"vendor_reconciliation.csv")}><Download size={12}/> Export All</button>
            </div>
            <div style={{background:"#0D1424",border:"1px solid #1E2D45",borderRadius:12,overflow:"hidden"}}>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:"#070B14",borderBottom:"1px solid #1E2D45"}}>
                    <th style={{padding:"9px 12px",width:20}}/>
                    {["Supplier","GSTIN","State","Taxable (Books)","Taxable (2B)","TV Diff","Tax (Books)","Tax (2B)","Tax Diff","Invoices"].map(h=>(
                      <th key={h} style={{padding:"9px 12px",textAlign:h.includes("Books")||h.includes("2B")||h.includes("Diff")||h==="Invoices"?"right":"left",fontWeight:600,color:"#475569",whiteSpace:"nowrap",fontSize:9,letterSpacing:"0.04em"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {vendorStats.map((v,i)=>{
                      const isOpen=expandedVendor===v.gstin;
                      const tvDiff=v.booksTV-v.twoBTV;
                      const txDiff=v.booksTX-v.twoBTX;
                      const tvDc=Math.abs(tvDiff)<1?"#475569":tvDiff>0?"#F87171":"#10B981";
                      const txDc=Math.abs(txDiff)<1?"#475569":txDiff>0?"#F87171":"#10B981";
                      return(<>
                        <tr key={v.gstin} onClick={()=>setExpandedVendor(isOpen?null:v.gstin)} style={{borderBottom:"1px solid #1E2D4530",background:isOpen?"#0c1a35":i%2===0?"transparent":"#0A0F1C",cursor:"pointer",transition:"background 0.15s"}}>
                          <td style={{padding:"8px 10px",color:"#64748B"}}>{isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</td>
                          <td style={{padding:"8px 12px",color:"#CBD5E1",fontWeight:600,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.name||"—"}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",fontSize:10,color:v.valid?"#64748B":"#F87171"}}>{v.gstin}</td>
                          <td style={{padding:"8px 12px",fontSize:10,color:"#475569"}}>{getState(v.gstin)}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#3B82F6",textAlign:"right",fontWeight:600}}>{inrFmt(v.booksTV,true)}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#8B5CF6",textAlign:"right",fontWeight:600}}>{inrFmt(v.twoBTV,true)}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",color:tvDc,textAlign:"right",fontWeight:700}}>{Math.abs(tvDiff)<1?"—":(tvDiff>0?"▲":"▼")+inrFmt(Math.abs(tvDiff),true)}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#3B82F6",textAlign:"right",fontWeight:600}}>{inrFmt(v.booksTX,true)}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",color:"#8B5CF6",textAlign:"right",fontWeight:600}}>{inrFmt(v.twoBTX,true)}</td>
                          <td style={{padding:"8px 12px",fontFamily:"monospace",color:txDc,textAlign:"right",fontWeight:700}}>{Math.abs(txDiff)<1?"—":(txDiff>0?"▲":"▼")+inrFmt(Math.abs(txDiff),true)}</td>
                          <td style={{padding:"8px 12px",textAlign:"right",color:"#94A3B8",fontWeight:600}}>{v.invoices.length}</td>
                        </tr>
                        {isOpen&&(
                          <tr key={v.gstin+"_detail"}><td colSpan={11} style={{padding:0,background:"#070B14"}}>
                            <div style={{padding:"16px 20px"}}>
                              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                                <div style={{background:"#0D1424",borderRadius:10,padding:"14px 16px",borderTop:"3px solid #3B82F6"}}>
                                  <div style={{fontSize:10,fontWeight:700,color:"#3B82F6",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Books Summary</div>
                                  <div style={{display:"flex",gap:20}}><div><div style={{fontSize:9,color:"#475569"}}>Taxable Value</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(v.booksTV)}</div></div><div><div style={{fontSize:9,color:"#475569"}}>Total Tax</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(v.booksTX)}</div></div></div>
                                </div>
                                <div style={{background:"#0D1424",borderRadius:10,padding:"14px 16px",borderTop:"3px solid #8B5CF6"}}>
                                  <div style={{fontSize:10,fontWeight:700,color:"#8B5CF6",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>GSTR-2B Summary</div>
                                  <div style={{display:"flex",gap:20}}><div><div style={{fontSize:9,color:"#475569"}}>Taxable Value</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(v.twoBTV)}</div></div><div><div style={{fontSize:9,color:"#475569"}}>Total Tax</div><div style={{fontFamily:"monospace",fontSize:16,fontWeight:700,color:"#CBD5E1"}}>{inrFmt(v.twoBTX)}</div></div></div>
                                </div>
                              </div>
                              <div style={{fontSize:10,fontWeight:700,color:"#64748B",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Invoice-level Comparison ({v.invoices.length} records)</div>
                              <table style={{width:"100%",borderCollapse:"collapse",fontSize:10,fontFamily:"monospace"}}>
                                <thead><tr style={{background:"#0A0F1C",borderBottom:"1px solid #1E2D45"}}>
                                  <th style={{padding:"7px 10px",textAlign:"left",color:"#475569",fontSize:9}}>Type</th>
                                  <th style={{padding:"7px 10px",textAlign:"left",color:"#3B82F6",fontSize:9}}>Invoice (Books)</th>
                                  <th style={{padding:"7px 10px",textAlign:"left",color:"#3B82F6",fontSize:9}}>Date (Books)</th>
                                  <th style={{padding:"7px 10px",textAlign:"right",color:"#3B82F6",fontSize:9}}>Taxable (Books)</th>
                                  <th style={{padding:"7px 10px",textAlign:"right",color:"#3B82F6",fontSize:9}}>Tax (Books)</th>
                                  <th style={{padding:"7px 4px",textAlign:"center",color:"#475569",fontSize:9}}>⟷</th>
                                  <th style={{padding:"7px 10px",textAlign:"left",color:"#8B5CF6",fontSize:9}}>Invoice (2B)</th>
                                  <th style={{padding:"7px 10px",textAlign:"left",color:"#8B5CF6",fontSize:9}}>Date (2B)</th>
                                  <th style={{padding:"7px 10px",textAlign:"right",color:"#8B5CF6",fontSize:9}}>Taxable (2B)</th>
                                  <th style={{padding:"7px 10px",textAlign:"right",color:"#8B5CF6",fontSize:9}}>Tax (2B)</th>
                                  <th style={{padding:"7px 10px",textAlign:"right",color:"#475569",fontSize:9}}>Δ Tax</th>
                                </tr></thead>
                                <tbody>
                                  {v.invoices.map((inv,j)=>{
                                    const d=inv.bTX-inv.tTX;
                                    const dc2=Math.abs(d)<1?"#475569":d>0?"#F87171":"#10B981";
                                    return(
                                      <tr key={j} style={{borderBottom:"1px solid #1E2D4520",background:j%2===0?"transparent":"#0D142440"}}>
                                        <td style={{padding:"6px 10px"}}><Badge type={inv.type}/></td>
                                        <td style={{padding:"6px 10px",color:"#CBD5E1"}}>{inv.bI||"—"}</td>
                                        <td style={{padding:"6px 10px",color:"#64748B"}}>{inv.bD||"—"}</td>
                                        <td style={{padding:"6px 10px",color:"#94A3B8",textAlign:"right"}}>{inv.bTV?inrFmt(inv.bTV):"—"}</td>
                                        <td style={{padding:"6px 10px",color:"#CBD5E1",textAlign:"right",fontWeight:600}}>{inv.bTX?inrFmt(inv.bTX):"—"}</td>
                                        <td style={{padding:"6px 4px",textAlign:"center",color:"#334155"}}>↔</td>
                                        <td style={{padding:"6px 10px",color:inv.tI&&inv.bI&&normalizeInv(inv.tI)!==normalizeInv(inv.bI)?"#A78BFA":"#CBD5E1"}}>{inv.tI||"—"}</td>
                                        <td style={{padding:"6px 10px",color:inv.bD&&inv.tD&&inv.bD!==inv.tD?"#A78BFA":"#64748B"}}>{inv.tD||"—"}</td>
                                        <td style={{padding:"6px 10px",color:"#94A3B8",textAlign:"right"}}>{inv.tTV?inrFmt(inv.tTV):"—"}</td>
                                        <td style={{padding:"6px 10px",color:"#CBD5E1",textAlign:"right",fontWeight:600}}>{inv.tTX?inrFmt(inv.tTX):"—"}</td>
                                        <td style={{padding:"6px 10px",textAlign:"right",color:dc2,fontWeight:Math.abs(d)>0.5?700:400}}>{Math.abs(d)>0.5?(d>0?"▲":"▼")+inrFmt(Math.abs(d)):"—"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td></tr>
                        )}
                      </>);
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ REVIEW ══ */}
        {tab==="review"&&(
          <div>
            <div style={{marginBottom:20}}>
              <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px",color:"#E2E8F0"}}>Manual Review Queue</h2>
              <p style={{fontSize:11,color:"#64748B",margin:0}}>Low-confidence matches, mismatches, and missing entries requiring human verification</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:18}}>
              {[{label:"Pending Review",value:stats?.pending,color:"#A78BFA",status:"pending"},{label:"Approved",value:stats?.approved,color:"#10B981",status:"approved"},{label:"Flagged",value:stats?.flagged,color:"#F87171",status:"flagged"}].map(({label,value,color,status})=>(
                <div key={label} onClick={()=>setReviewFilter(status)} style={{background:"#0D1424",border:`1px solid ${reviewFilter===status?color:"#1E2D45"}`,borderRadius:10,padding:"14px 18px",cursor:"pointer"}}>
                  <div style={{fontSize:9,color:"#64748B",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
                  <div style={{fontSize:24,fontWeight:700,color,fontFamily:"monospace"}}>{value||0}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                <Search size={12} style={{position:"absolute",left:9,color:"#475569"}}/>
                <input placeholder="Search…" value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)} style={{...S.input,width:200}}/>
              </div>
              {[["all","All"],["pending","Pending"],["approved","Approved"],["flagged","Flagged"]].map(([v,l])=>(
                <button key={v} style={S.pill(reviewFilter===v,"#60A5FA")} onClick={()=>setReviewFilter(v)}>{l}</button>
              ))}
              <span style={{...S.mono,color:"#475569"}}>{reviewQueue.length} items</span>
              <button style={{...S.ghostBtn,marginLeft:"auto"}} onClick={()=>downloadCSV(reviewQueue,"review_queue.csv")}><Download size={12}/> Export Queue</button>
            </div>
            <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
              <span style={{fontSize:10,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.05em",marginRight:4}}>Issue Type:</span>
              {reviewIssueTypes.map(t=>{
                const col=t==="all"?"#60A5FA":(MC[t]?.color||"#64748B");
                const count=t==="all"
                  ?enriched.filter(r=>r.needsReview&&(reviewFilter==="all"||r.reviewStatus===reviewFilter)).length
                  :enriched.filter(r=>r.needsReview&&r.type===t&&(reviewFilter==="all"||r.reviewStatus===reviewFilter)).length;
                return(
                  <button key={t} style={S.pill(reviewIssueFilter===t,col)} onClick={()=>setReviewIssueFilter(t)}>
                    {t==="all"?"All":t} ({count})
                  </button>
                );
              })}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {reviewQueue.length===0&&<div style={{...S.card,textAlign:"center",padding:48,color:"#475569"}}><CheckCircle size={28} style={{margin:"0 auto 10px",opacity:0.3}}/><div>All items reviewed!</div></div>}
              {reviewQueue.map(r=>{
                const ir=reviewItems[r.id]||{status:"pending",note:""};
                const delta=r.bTX&&r.tTX?r.bTX-r.tTX:0;
                return(
                  <div key={r.id} style={{background:"#0D1424",border:`1px solid ${MC[r.type]?.border||"#1E2D45"}`,borderRadius:12,padding:18}}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                      <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:7,alignItems:"center"}}>
                        <Badge type={r.type}/><ConfBar value={r.conf}/><StatusChip status={ir.status}/>
                        {!r.gstinValid&&r.bG&&<span style={{background:"#2d0808",color:"#F87171",border:"1px solid #F8717130",borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700}}>Invalid GSTIN</span>}
                        {r.bCnt>1&&<span style={{background:"#25081a",color:"#E879F9",border:"1px solid #E879F930",borderRadius:5,padding:"2px 7px",fontSize:10,fontWeight:700}}>{r.bCnt}× Split</span>}
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        <button style={{...S.ghostBtn,color:"#10B981",border:"1px solid #10B98130",fontSize:10,padding:"6px 12px"}} onClick={()=>updateReview(r.id,"approved")}><ThumbsUp size={12}/> Approve</button>
                        <button style={{...S.ghostBtn,color:"#F87171",border:"1px solid #F8717130",fontSize:10,padding:"6px 12px"}} onClick={()=>updateReview(r.id,"flagged")}><ThumbsDown size={12}/> Flag</button>
                      </div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:10}}>
                      {[{label:"Books of Accounts",G:r.bG,I:r.bI,D:r.bD,TV:r.bTV,CG:r.bCG,SG:r.bSG,IG:r.bIG,TX:r.bTX,color:"#3B82F6"},{label:"GSTR-2B",G:r.tG,I:r.tI,D:r.tD,TV:r.tTV,CG:r.tCG,SG:r.tSG,IG:r.tIG,TX:r.tTX,color:"#8B5CF6"}].map(({label,G,I,D,TV,CG,SG,IG,TX,color})=>(
                        <div key={label} style={{background:"#070B14",borderRadius:8,padding:"12px 14px",borderTop:`2px solid ${color}`}}>
                          <div style={{fontSize:9,fontWeight:700,color,marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                            {[["GSTIN",G||"—"],["Invoice",I||"—"],["Date",D||"—"],["Taxable",TV?inrFmt(TV):"—"],["CGST",CG?inrFmt(CG):"—"],["SGST",SG?inrFmt(SG):"—"],["IGST",IG?inrFmt(IG):"—"],["Total Tax",TX?inrFmt(TX):"—"]].map(([k,v])=>(
                              <div key={k}><div style={{fontSize:9,color:"#475569",marginBottom:2}}>{k}</div><div style={{fontFamily:"monospace",fontSize:11,color:"#CBD5E1",wordBreak:"break-all"}}>{v}</div></div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {Math.abs(delta)>0.5&&<div style={{background:"#1c1005",border:"1px solid #F59E0B30",borderRadius:7,padding:"7px 12px",marginBottom:10,fontSize:10,color:"#F59E0B",display:"flex",alignItems:"center",gap:8}}><AlertTriangle size={12}/> Tax difference: {inrFmt(Math.abs(delta))} — Books {delta>0?"higher":"lower"} than 2B</div>}
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input placeholder="Add a review note…" value={noteInput[r.id]??ir.note??""} onChange={e=>setNoteInput(prev=>({...prev,[r.id]:e.target.value}))} style={{...S.input,flex:1,paddingLeft:10}}/>
                      <button style={{...S.ghostBtn,padding:"7px 12px"}} onClick={()=>updateReview(r.id,ir.status,noteInput[r.id]??"")}>Save Note</button>
                    </div>
                    {ir.note&&<div style={{fontSize:10,color:"#475569",marginTop:6,fontStyle:"italic"}}>Note: {ir.note}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
