
  (() => {
    'use strict';

    const STORAGE_KEY = 'fuelflow-static-demo-v1';
    const AUTOSAVE_BACKUP_KEY = `${STORAGE_KEY}-autosave-versions`;
    const AUTOSAVE_QUARANTINE_KEY = `${STORAGE_KEY}-quarantine`;
    const AUTOSAVE_FORMAT = 'icon-energy-autosave-v1';
    const AUTOSAVE_DB_NAME = 'icon-energy-operations-persistence';
    const AUTOSAVE_DB_VERSION = 1;
    const AUTOSAVE_MAX_BACKUPS = 12;
    const LOCAL_AUTOSAVE_MAX_BACKUPS = 3;
    const AUTOSAVE_MAX_JOURNAL = 100;
    const STATION_RECORD_COLLECTIONS = ['readings','deliveries','deposits','stockReadings','adjustments','meterRequests','meterAdjustments','priceRequests','priceHistory','discrepancies','maintenance','audit'];
    let bootRestorePending = true;
    let suppressAutosaveWrite = false;
    let autosaveVersions = [];
    let autosaveRuntime = {ready:false,indexedDB:false,storagePersistent:null,revision:0,lastSavedAt:'',lastError:'',lastWarning:'',backupCount:0,restoreSource:'',corruptRaw:'',status:'boot',pendingAction:'',usage:0,quota:0,lastSnapshotAt:'',lastExportAt:'',incompleteOperation:null,migratedFrom:'',writerId:`tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`};
    const THEME_KEY = 'fuelflow-theme';
    let theme = 'dark';
    try { const savedTheme=localStorage.getItem(THEME_KEY); if(savedTheme==='dark'||savedTheme==='light')theme=savedTheme; } catch(e) { /* keep the ICON navy default when storage is unavailable */ }
    function applyTheme(save = false) {
      document.documentElement.setAttribute('data-theme',theme);
      const themeMeta=document.querySelector('meta[name="theme-color"]');if(themeMeta)themeMeta.setAttribute('content',theme==='dark'?'#04151b':'#eef4f5');
      if(save) { try { localStorage.setItem(THEME_KEY,theme); } catch(e) { /* theme still applies for this session */ } }
    }
    applyTheme(false);
    const PAYMENT_KEYS = ['cash', 'mobile', 'card', 'credit', 'other'];
    const PAYMENT_LABELS = { cash: 'Cash', mobile: 'Mobile money', card: 'Card', credit: 'Credit', other: 'Other' };
    const BUSINESS_CLOSE_HOUR = 21;
    const BANK_DEADLINE_HOUR = 10;
    const DEPOSIT_WORKFLOW = 'full-sales-v1';
    const SHIFT_ORDER = { Day: 1, Late: 2, Night: 3 };
    const PAGE_META = {
      dashboard: { title: 'Station overview', eyebrow: 'OPERATIONS', description: 'A live view of stock, sales and outstanding actions.' },
      stock: { title: 'Tank stock', eyebrow: 'STOCK CONTROL', description: 'Reconcile expected fuel against physical tank measurements.' },
      deliveries: { title: 'Fuel deliveries', eyebrow: 'RECEIVING', description: 'Register tanker arrivals and track approval through receipt.' },
      readings: { title: 'Pump readings & sales', eyebrow: 'DISPENSERS', description: 'Capture shift meter readings and reconcile every active nozzle.' },
      deposits: { title: 'Bank deposits', eyebrow: 'BANK CONTROL', description: 'Record deposits (in stages if needed) and track next-morning manager approval.' },
      approvals: { title: 'Approval queue', eyebrow: 'MANAGER REVIEW', description: 'Approve or reject deliveries and meter adjustments.' },
      discrepancies: { title: 'Discrepancy review', eyebrow: 'EXCEPTIONS', description: 'Investigate exceptions and authorize traceable adjustments.' },
      reconciliation: { title: 'Sales reconciliation', eyebrow: 'FINANCIAL CONTROL', description: 'Compare recorded sales, payment channels and bank deposits.' },
      reports: { title: 'Operational reports', eyebrow: 'REPORTING', description: 'Generate, print or export daily and period reports.' },
      audit: { title: 'Audit trail', eyebrow: 'ACCOUNTABILITY', description: 'A chronological record of actions, decisions and corrections.' },
      setup: { title: 'Stations & pumps', eyebrow: 'MANAGER CONTROLS', description: 'Create station workspaces, configure paired nozzles and assign Supervisors.' },
      data: { title: 'Data management', eyebrow: 'MANAGER CONTROLS', description: 'Back up, restore or reset records for the active station.' }
    };
    const NAV = {
      supervisor: [
        ['dashboard', 'Overview', 'grid', 'Daily operations'], ['readings', 'Pump readings', 'meter', 'Daily operations'], ['stock', 'Tank stock', 'tank', 'Daily operations'], ['deliveries', 'Deliveries', 'truck', 'Daily operations'],
        ['deposits', 'Bank deposits', 'bank', 'Finance'],
        ['reports', 'Reports', 'chart', 'Records'], ['audit', 'Audit trail', 'history', 'Records']
      ],
      manager: [
        ['dashboard', 'Overview', 'grid', 'Oversight'], ['approvals', 'Approval queue', 'check', 'Oversight'], ['discrepancies', 'Discrepancies', 'alert', 'Oversight'],
        ['reconciliation', 'Reconciliation', 'bank', 'Finance'],
        ['reports', 'Reports', 'chart', 'Records'], ['audit', 'Audit trail', 'history', 'Records'],
        ['setup', 'Stations & pumps', 'wrench', 'Administration'], ['data', 'Data management', 'file', 'Administration']
      ]
    };
    const MANAGER_VIEW_LABELS = { stock: 'Tank stock', sales: 'Sales & tenders', meters: 'Meters & collections', performance: 'Performance' };
    const BOTTOM_NAV = { supervisor: ['dashboard', 'readings', 'stock', 'deposits'], manager: ['dashboard', 'approvals', 'reconciliation', 'reports'] };
    const BOTTOM_LABELS = { dashboard: 'Overview', readings: 'Readings', stock: 'Stock', deposits: 'Banking', approvals: 'Approvals', reconciliation: 'Reconcile', reports: 'Reports' };
    const REPORTS = [
      ['tank-stock', 'Daily underground tank stock', 'tank'],
      ['deliveries', 'Fuel delivery & approval', 'truck'],
      ['delivery-check', 'Pre / post-delivery comparison', 'compare'],
      ['meter-readings', 'Daily pump meter readings', 'meter'],
      ['nozzle-sales', 'Sales by dispenser & nozzle', 'chart'],
      ['dispenser-summary', 'Dispenser summary · Super & Diesel', 'fuel'],
      ['payment-recon', 'Daily payment reconciliation', 'bank'],
      ['bank-recon', 'Bank deposit reconciliation', 'receipt'],
      ['variance', 'Stock variance & adjustments', 'alert'],
      ['exceptions', 'Approvals & discrepancies', 'bell'],
      ['performance', 'Weekly / monthly performance', 'trend']
    ];
    const ICON_PATHS = {
      grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
      bolt: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
      tank: '<path d="M6 21V5.8A2.8 2.8 0 0 1 8.8 3h6.4A2.8 2.8 0 0 1 18 5.8V21M6 8h12M9 3V1.8M15 3V1.8M6 18h12M4 21h16"/><path d="M10 12h4"/>',
      truck: '<path d="M3 6h11v12H3zM14 10h4l3 3v5h-7z"/><circle cx="7.5" cy="19" r="1.8"/><circle cx="17.5" cy="19" r="1.8"/><path d="M14 14h7"/>',
      meter: '<path d="M5 20V9.5A2.5 2.5 0 0 1 7.5 7h9A2.5 2.5 0 0 1 19 9.5V20M3 20h18M8 3h8M12 3v4"/><path d="m12 12-2.2 3.2M12 12l2.6 1.4"/><circle cx="12" cy="12" r=".7"/>',
      bank: '<path d="m3 9 9-6 9 6M4 10h16M5 19h14M3 21h18M7 10v8M12 10v8M17 10v8"/>',
      chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/><path d="m3 8 5-3 5 4 7-6"/>',
      history: '<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
      check: '<path d="m5 12 4 4L19 6"/><circle cx="12" cy="12" r="9"/>',
      alert: '<path d="M10.3 4.8 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      chevron: '<path d="m9 18 6-6-6-6"/>',
      down: '<path d="m6 9 6 6 6-6"/>',
      close: '<path d="m18 6-12 12M6 6l12 12"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
      lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 14v3"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8M8 16h4"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
      print: '<path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
      fuel: '<path d="M7 21V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M5 21h14M9 6h6M9 10h6M17 7h2l2 2v7a2 2 0 0 1-4 0v-4"/>',
      money: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.5-.8-1.5-1.2-3-1.2-1.7 0-2.8.8-2.8 2s1.1 1.8 2.8 2.1 2.8.7 2.8 2-1.1 2.2-2.9 2.2c-1.4 0-2.6-.5-3.2-1.4M12.5 5.5v13"/>',
      trend: '<path d="m3 17 6-6 4 4 8-9M15 6h6v6"/>',
      shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
      refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
      fuelmark: '<path d="M12 2.5c-3.1 4.1-6 7-6 11a6 6 0 0 0 12 0c0-4-2.9-6.9-6-11Z"/><path d="M9.2 14.5a3 3 0 0 0 3 3"/>',
      clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4.5V3h6v1.5M8 10h8M8 14h8M8 18h5"/>',
      wrench: '<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3-3z"/>',
      eye: '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.5"/>',
      filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
      checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16 9"/>',
      logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
      file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7M8 13h8M8 17h8"/>',
      compare: '<path d="M8 4H4v4M4 4l7 7M16 20h4v-4M20 20l-7-7"/><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/>',
      dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
      moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      truckfront: '<path d="M3 7h18v12H3zM7 7V4h10v3M7 19v2M17 19v2M5 12h14"/><circle cx="7" cy="16" r="1"/><circle cx="17" cy="16" r="1"/>'
    };
    const icon = (name, size = 18) => `<span class="icon" aria-hidden="true"><svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ICON_PATHS.info}</svg></span>`;
    function themeToggleMarkup(className='topbar-icon-btn') {
      const isDark=theme==='dark';
      const label=isDark?'Switch to light mode':'Switch to dark mode';
      return `<button class="${className}" type="button" data-action="toggle-theme" aria-label="${label}" aria-pressed="${isDark}" title="${label}">${icon(isDark?'sun':'moon',16)}</button>`;
    }

    const localDateIso = (date = new Date()) => {
      const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return d.toISOString().slice(0, 10);
    };
    let TODAY = localDateIso();
    let YESTERDAY = shiftDate(TODAY, -1);
    function shiftDate(iso, days) {
      const d = new Date(`${iso}T12:00:00`);
      d.setDate(d.getDate() + days);
      return localDateIso(d);
    }
    function dateLong(iso) {
      if (!iso) return '—';
      const d = new Date(`${iso}T12:00:00`);
      return new Intl.DateTimeFormat('en-GH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    }
    function dateShort(iso) {
      if (!iso) return '—';
      const d = new Date(`${iso}T12:00:00`);
      return new Intl.DateTimeFormat('en-GH', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
    }
    function timeShort(iso) {
      if (!iso) return '—';
      return new Intl.DateTimeFormat('en-GH', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    }
    function dateTime(iso) {
      if (!iso) return '—';
      return `${dateShort(localDateIso(new Date(iso)))} · ${timeShort(iso)}`;
    }
    function relativeTime(iso) {
      if (!iso) return '';
      const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      return `${Math.floor(hours / 24)}d ago`;
    }
    function stampAgo(minutes) { return new Date(Date.now() - minutes * 60000).toISOString(); }
    function esc(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }
    function num(value, decimals = 1) {
      const n = Number(value || 0);
      return n.toLocaleString('en-GH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    function money(value) {
      return `GHS ${Number(value || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    function signedMoney(value) {
      const n=Number(value||0),sign=n<0?'−':n>0?'+':'';
      return `${sign}${money(Math.abs(n))}`;
    }
    function signedLitres(value, decimals = 0, unit = true) {
      const n = Number(Number(value || 0).toFixed(decimals));
      const sign = n < 0 ? '−' : n > 0 ? '+' : '';
      return `${sign}${num(Math.abs(n), decimals)}${unit ? ' L' : ''}`;
    }
    /* Number display standard (DESIGN-SYSTEM.md §5): summaries show whole litres,
       ledgers show the 0.1 L the meters and dips record, money is always GHS with 2 decimals. */
    function litres(value) { return `${num(value, 0)} L`; }
    function makeId(prefix) {
      return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    }
    function payObject(values = {}) {
      return { cash: Number(values.cash || 0), mobile: Number(values.mobile || 0), card: Number(values.card || 0), credit: Number(values.credit || 0), other: Number(values.other || 0) };
    }
    function sumPayments(payments) { return PAYMENT_KEYS.reduce((sum, key) => sum + Number((payments || {})[key] || 0), 0); }

    /* Base configuration for a station: one Super/Petrol and one Diesel physical tank, one pump with a nozzle
       for each fuel, and no operational records. Real values are entered by the Manager during setup. */
    function makeSeedState() {
      const tanks = [
        { id: 'T-SUPER', name: 'Super underground tank', fuel: 'Petrol', capacity: 60000, openingStock: 0, physicalStock: 0, restrictedLitres: 0, purchaseCostPerLitre: 0, tolerance: 300, nozzles: [], dipAt: null },
        { id: 'T-DIESEL', name: 'Diesel underground tank', fuel: 'Diesel', capacity: 45000, openingStock: 0, physicalStock: 0, restrictedLitres: 0, purchaseCostPerLitre: 0, tolerance: 300, nozzles: [], dipAt: null }
      ];
      const dispensers = [{ id: 'DP-01', stationId: 'ST-01', active: true, createdAt: new Date().toISOString() }];
      const nozzles = [
        { id: 'NZ-01-S', dispenser: 'DP-01', label: 'Super', nozzleType: 'Super', fuel: 'Petrol', tankId: 'T-SUPER', price: 0, active: true, maintenance: 'Operational' },
        { id: 'NZ-01-D', dispenser: 'DP-01', label: 'Diesel', nozzleType: 'Diesel', fuel: 'Diesel', tankId: 'T-DIESEL', price: 0, active: true, maintenance: 'Operational' }
      ];
      tanks.forEach(tank => { tank.nozzles = nozzles.filter(nozzle => nozzle.tankId === tank.id).map(nozzle => nozzle.id); });
      return {
        schema: 3,
        station: { name: 'Main station', location: '', dispenserCount: dispensers.length, bankingPolicy: ['sales'], requirePreUnloadApproval: true, varianceTolerance: 300 },
        tanks, dispensers, nozzles, users: [], readings: [], deliveries: [], deposits: [], stockReadings: [],
        adjustments: [], meterRequests: [], meterAdjustments: [], priceRequests: [], priceHistory: [], discrepancies: [], maintenance: [], audit: []
      };
    }
    let migrationNotice = '';
    function fuelClass(value) {
      return String(value || '').toLowerCase().includes('diesel') ? 'Diesel' : 'Petrol';
    }
    function tankIdForFuel(fuel) { return fuelClass(fuel) === 'Diesel' ? 'T-DIESEL' : 'T-SUPER'; }
    function dispenserIdForNumber(number) { return `DP-${String(number).padStart(2, '0')}`; }
    function nozzleIdFor(dispenserNumber, fuel) { return `NZ-${String(dispenserNumber).padStart(2, '0')}-${fuelClass(fuel) === 'Diesel' ? 'D' : 'S'}`; }
    function dispenserNumber(value) {
      const match = String(value || '').match(/(\d+)/);
      return match ? Math.max(1, Number(match[1])) : 0;
    }
    function ensureDispenserSetup(data, requestedCount) {
      if (!data || !data.station || !Array.isArray(data.tanks)) return data;
      const count = Math.max(1, Math.min(50, Math.floor(Number(requestedCount) || 1)));
      const priorDispensers = Array.isArray(data.dispensers) ? data.dispensers : [];
      const priorNozzles = Array.isArray(data.nozzles) ? data.nozzles : [];
      const maxExisting = Math.max(count, ...priorDispensers.map(d => dispenserNumber(d.id)), ...priorNozzles.map(n => dispenserNumber(n.dispenser || n.dispenserId || n.id)));
      const total = Math.max(count, Math.min(50, maxExisting || count));
      const firstPrice = fuel => {
        const existing = priorNozzles.find(n => fuelClass(n.fuel || n.fuelType || n.label || n.nozzleType) === fuel && Number(n.price) > 0);
        const seed = makeSeedState().nozzles.find(n => n.fuel === fuel);
        return Number(existing ? existing.price : (seed ? seed.price : 0));
      };
      const dispensers = [];
      const nozzles = [];
      for (let i = 1; i <= total; i += 1) {
        const id = dispenserIdForNumber(i);
        const oldDispenser = priorDispensers.find(d => String(d.id || '') === id) || {};
        const active = i <= count;
        const dispenser = { ...oldDispenser, id, stationId: data.station.id || oldDispenser.stationId || 'ST-01', stationName:data.station.name||'Station 01', active, createdAt: oldDispenser.createdAt || new Date().toISOString() };
        dispensers.push(dispenser);
        ['Petrol', 'Diesel'].forEach(fuel => {
          const nozzleId = nozzleIdFor(i, fuel);
          const oldNozzle = priorNozzles.find(n => String(n.id || '') === nozzleId) || priorNozzles.find(n => String(n.dispenser || n.dispenserId || '') === id && fuelClass(n.fuel || n.fuelType || n.label || n.nozzleType) === fuel) || {};
          const label = fuel === 'Diesel' ? 'Diesel' : 'Super';
          nozzles.push({
            ...oldNozzle, id: nozzleId, stationId:data.station.id||'ST-01', dispenser: id, dispenserId: id, label, nozzleType: label, fuel,
            tankId: tankIdForFuel(fuel), price: Number(oldNozzle.price) > 0 ? Number(oldNozzle.price) : firstPrice(fuel),
            active, maintenance: oldNozzle.maintenance || 'Operational'
          });
        });
      }
      data.dispensers = dispensers;
      data.nozzles = nozzles;
      data.station.dispenserCount = count;
      data.tanks.forEach(tank => { tank.stationId=data.station.id||'ST-01'; tank.nozzles = nozzles.filter(nozzle => nozzle.tankId === tank.id).map(nozzle => nozzle.id); });
      return data;
    }
    function applySalesDepositPolicy(data) {
      if(!data||!data.station)return false;
      let changed=false;
      if(!Array.isArray(data.deposits)){data.deposits=[];changed=true;}
      data.deposits.forEach(deposit=>{
        if(deposit&&deposit.workflow!==DEPOSIT_WORKFLOW&&deposit.workflow!=='legacy-cash'){
          deposit.legacyStatus=deposit.status||'';
          deposit.workflow='legacy-cash';
          deposit.status='Legacy cash record';
          deposit.legacyReason='Retained from the previous cash-only deposit policy; not counted toward the full meter-sales deposit target.';
          changed=true;
        }
      });
      if(!Array.isArray(data.station.bankingPolicy)||data.station.bankingPolicy.length!==1||data.station.bankingPolicy[0]!=='sales'){
        data.station.bankingPolicy=['sales'];changed=true;
      }
      if(changed&&Array.isArray(data.audit))data.audit.unshift({id:makeId('AUD'),at:new Date().toISOString(),user:'System',role:'System',action:'Bank deposit policy updated',record:data.station.name||'Station 01',oldValue:'Cash-only deposit basis',newValue:'Full daily meter-sales value · due by 10:00 am next day',reason:'Existing cash-deposit records were retained and labeled as legacy; they were not altered or counted against the new sales-based target.'});
      return changed;
    }

    function migrateLegacyState(legacy) {
      const source = JSON.parse(JSON.stringify(legacy || {}));
      const seed = makeSeedState();
      const oldTanks = Array.isArray(source.tanks) ? source.tanks : [];
      const oldNozzles = Array.isArray(source.nozzles) ? source.nozzles : [];
      const tankLookup = new Map(oldTanks.map(tank => [String(tank.id), tank]));
      const combineTank = fuel => {
        const base = seed.tanks.find(tank => tank.fuel === fuel);
        const matches = oldTanks.filter(tank => fuelClass(tank.fuel || tank.fuelType || tank.name) === fuel);
        if (!matches.length) return { ...base, nozzles: [] };
        const sum = getter => matches.reduce((total, tank) => total + Number(getter(tank) || 0), 0);
        const opening = sum(tank => tank.openingStock ?? tank.opening ?? 0);
        const physical = sum(tank => tank.physicalStock ?? tank.currentStock ?? tank.stock ?? tank.openingStock ?? 0);
        const capacity = sum(tank => tank.capacity) || Number(base.capacity);
        const costWeight = matches.reduce((total, tank) => total + Math.max(0, Number(tank.openingStock ?? tank.physicalStock ?? 0)), 0) || matches.length;
        const weightedCost = matches.reduce((total, tank) => total + Number(tank.purchaseCostPerLitre ?? tank.costPerLitre ?? tank.unitCost ?? base.purchaseCostPerLitre) * (Math.max(0, Number(tank.openingStock ?? tank.physicalStock ?? 0)) || 1), 0) / costWeight;
        const dipAt = matches.map(tank => tank.dipAt).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
        return {
          ...base, id: tankIdForFuel(fuel), name: fuel === 'Diesel' ? 'Diesel underground tank' : 'Super underground tank', fuel,
          capacity, openingStock: opening, physicalStock: physical,
          restrictedLitres: sum(tank => tank.restrictedLitres), purchaseCostPerLitre: Number(weightedCost || base.purchaseCostPerLitre),
          tolerance: Math.max(Number(base.tolerance || 0), ...matches.map(tank => Number(tank.tolerance || 0))), dipAt, nozzles: []
        };
      };
      const tanks = [combineTank('Petrol'), combineTank('Diesel')];
      tanks[0].capacity = 60000;
      tanks[1].capacity = 45000;
      const aliases = new Map();
      const legacyDispenserRecords = Array.isArray(source.dispensers) ? source.dispensers : [];
      const identityKeys = [];
      const addAlias = (key, index) => {
        const normalized = String(key || '').trim().toLowerCase();
        if (normalized) aliases.set(normalized, index);
      };
      const addIdentity = (key, indexHint) => {
        const normalized = String(key || '').trim().toLowerCase();
        if (!normalized) return indexHint;
        if (aliases.has(normalized)) return aliases.get(normalized);
        const index = identityKeys.length + 1;
        identityKeys.push(String(key).trim());
        aliases.set(normalized, index);
        return index;
      };
      legacyDispenserRecords.forEach((dispenser, index) => {
        const number = index + 1;
        const keys = [dispenser.id, dispenser.dispenserId, dispenser.name, dispenser.label].filter(Boolean);
        if (!keys.length) keys.push(`Legacy dispenser ${number}`);
        if (!identityKeys[number - 1]) identityKeys[number - 1] = String(keys[0]);
        keys.forEach(key => addAlias(key, number));
      });
      const legacyAssignments = [];
      oldNozzles.forEach((nozzle, index) => {
        const key = nozzle.dispenser || nozzle.dispenserId || '';
        const fallback = Math.floor(index / 2) + 1;
        let number = key ? aliases.get(String(key).trim().toLowerCase()) : 0;
        if (!number && legacyDispenserRecords.length && fallback <= legacyDispenserRecords.length) {
          number = fallback;
          addAlias(key, number);
        }
        if (!number) number = key ? addIdentity(key, fallback) : fallback;
        legacyAssignments.push({ nozzle, number, fuel: fuelClass(nozzle.fuel || nozzle.fuelType || tankLookup.get(String(nozzle.tankId || ''))?.fuel || nozzle.nozzleType || nozzle.label) });
      });
      const activeSetting = Number(source.station && source.station.dispenserCount);
      let activeCount = Number.isFinite(activeSetting) && activeSetting > 0
        ? Math.floor(activeSetting)
        : legacyDispenserRecords.length
          ? legacyDispenserRecords.filter(dispenser => dispenser.active !== false).length
          : Math.max(1, ...legacyAssignments.map(entry => entry.number));
      activeCount = Math.max(1, Math.min(50, activeCount));
      const total = Math.max(activeCount, legacyDispenserRecords.length, ...legacyAssignments.map(entry => entry.number), 1);
      const legacyConfig = new Map();
      const nozzleIdMap = new Map();
      legacyAssignments.forEach(entry => {
        const newId = nozzleIdFor(entry.number, entry.fuel);
        const key = `${entry.number}|${entry.fuel}`;
        if (!legacyConfig.has(key)) legacyConfig.set(key, entry.nozzle);
        if (entry.nozzle.id != null) nozzleIdMap.set(String(entry.nozzle.id), newId);
      });
      const dispensers = [];
      const nozzles = [];
      for (let i = 1; i <= Math.min(50, total); i += 1) {
        const oldRecord = legacyDispenserRecords[i - 1] || {};
        const active = i <= activeCount;
        const id = dispenserIdForNumber(i);
        dispensers.push({ ...oldRecord, id, stationId: (source.station && source.station.name) || 'Station 01', active, createdAt: oldRecord.createdAt || new Date().toISOString() });
        ['Petrol', 'Diesel'].forEach(fuel => {
          const configured = legacyConfig.get(`${i}|${fuel}`) || oldNozzles.find(nozzle => fuelClass(nozzle.fuel || nozzle.fuelType || tankLookup.get(String(nozzle.tankId || ''))?.fuel || nozzle.nozzleType || nozzle.label) === fuel) || {};
          const seedNozzle = seed.nozzles.find(nozzle => nozzle.fuel === fuel);
          nozzles.push({
            ...configured, id: nozzleIdFor(i, fuel), dispenser: id, dispenserId: id,
            label: fuel === 'Diesel' ? 'Diesel' : 'Super', nozzleType: fuel === 'Diesel' ? 'Diesel' : 'Super', fuel,
            tankId: tankIdForFuel(fuel), price: Number(configured.price) > 0 ? Number(configured.price) : Number(seedNozzle.price),
            active, maintenance: configured.maintenance || 'Operational'
          });
        });
      }
      tanks.forEach(tank => { tank.nozzles = nozzles.filter(nozzle => nozzle.tankId === tank.id).map(nozzle => nozzle.id); });
      const newNozzleById = new Map(nozzles.map(nozzle => [nozzle.id, nozzle]));
      const getLegacyNozzle = record => {
        const direct = nozzleIdMap.get(String(record.nozzleId || record.nozzle || ''));
        if (direct && newNozzleById.has(direct)) return newNozzleById.get(direct);
        const key = String(record.dispenserId || record.dispenser || '').trim().toLowerCase();
        let number = aliases.get(key) || dispenserNumber(record.dispenserId || record.dispenser) || 1;
        number = Math.max(1, Math.min(nozzles.length / 2, number));
        const fuel = fuelClass(record.fuelType || record.fuel || tankLookup.get(String(record.tankId || ''))?.fuel || record.nozzleLabel);
        return newNozzleById.get(nozzleIdFor(number, fuel)) || nozzles[0];
      };
      const remapTankRecord = record => {
        const priorTank = tankLookup.get(String(record.tankId || ''));
        const fuel = priorTank ? fuelClass(priorTank.fuel || priorTank.fuelType || priorTank.name) : fuelClass(record.fuelType || record.fuel);
        return { ...record, tankId: tankIdForFuel(fuel) };
      };
      const migrated = {
        ...seed, ...source, schema: 3,
        station: { ...seed.station, ...(source.station || {}), dispenserCount: activeCount },
        tanks, dispensers, nozzles,
        users: Array.isArray(source.users) ? source.users : seed.users,
        readings: (Array.isArray(source.readings) ? source.readings : []).map(record => {
          const nozzle = getLegacyNozzle(record);
          const litres = Number(record.litres ?? (Number(record.closing || 0) - Number(record.opening || 0)));
          const price = Number(record.price ?? nozzle.price);
          return { ...record, nozzleId: nozzle.id, dispenserId: nozzle.dispenser, nozzleLabel: nozzle.label, fuelType: nozzle.fuel, tankId: nozzle.tankId, litres, price, salesValue: Number(record.salesValue ?? (litres * price)) };
        }),
        deliveries: (Array.isArray(source.deliveries) ? source.deliveries : []).map(record => remapTankRecord(record)),
        stockReadings: (Array.isArray(source.stockReadings) ? source.stockReadings : []).map(record => remapTankRecord(record)),
        adjustments: (Array.isArray(source.adjustments) ? source.adjustments : []).map(record => remapTankRecord(record)),
        discrepancies: (Array.isArray(source.discrepancies) ? source.discrepancies : []).map(record => record.tankId ? remapTankRecord(record) : record),
        meterRequests: (Array.isArray(source.meterRequests) ? source.meterRequests : []).map(record => { const nozzle=getLegacyNozzle(record); return { ...record, nozzleId:nozzle.id, dispenserId:nozzle.dispenser, tankId:nozzle.tankId, fuelType:nozzle.fuel }; }),
        meterAdjustments: (Array.isArray(source.meterAdjustments) ? source.meterAdjustments : []).map(record => { const nozzle=getLegacyNozzle(record); return { ...record, nozzleId:nozzle.id }; }),
        priceRequests: (Array.isArray(source.priceRequests) ? source.priceRequests : []).map(record => ({ ...record, fuelType:fuelClass(record.fuelType) })),
        priceHistory: (Array.isArray(source.priceHistory) ? source.priceHistory : []).map(record => ({ ...record, fuelType:fuelClass(record.fuelType) }))
      };
      ['deposits','maintenance','audit'].forEach(key => { migrated[key] = Array.isArray(source[key]) ? source[key] : []; });
      applySalesDepositPolicy(migrated);
      migrated.maintenance = migrated.maintenance.map(record => {
        if (!record.nozzleId) return record;
        const nozzle = getLegacyNozzle(record);
        return { ...record, nozzleId:nozzle.id, dispenserId:nozzle.dispenser };
      });
      migrated.audit.unshift({ id: makeId('AUD'), at: new Date().toISOString(), user: 'System', role: 'System', action: 'Station configuration migrated to two underground tanks', record: migrated.station.name || 'Station 01', oldValue: `${oldTanks.length} tanks · ${oldNozzles.length} nozzles`, newValue: `Super 60,000 L · Diesel 45,000 L · ${activeCount} dispensers`, reason: 'Schema 1 activity retained; tank and nozzle references remapped by fuel type.' });
      ensureDispenserSetup(migrated, activeCount);
      migrationNotice = 'Existing station data was migrated to Super 60,000 L and Diesel 45,000 L tanks. Historical readings and records remain available.';
      return migrated;
    }
    function applyTankCapacities(data,forceDefaults=false) {
      if(!data||!Array.isArray(data.tanks))return data;
      const superTank=data.tanks.find(tank=>tank.fuel==='Petrol')||data.tanks.find(tank=>tank.id==='T-SUPER');
      const dieselTank=data.tanks.find(tank=>tank.fuel==='Diesel')||data.tanks.find(tank=>tank.id==='T-DIESEL');
      if(!superTank||!dieselTank)return data;
      const validCapacity=value=>Number.isFinite(Number(value))&&Number(value)>0;
      superTank.id='T-SUPER';superTank.name='Super underground tank';superTank.fuel='Petrol';superTank.capacity=forceDefaults||!validCapacity(superTank.capacity)?60000:Number(superTank.capacity);
      dieselTank.id='T-DIESEL';dieselTank.name='Diesel underground tank';dieselTank.fuel='Diesel';dieselTank.capacity=forceDefaults||!validCapacity(dieselTank.capacity)?45000:Number(dieselTank.capacity);
      data.tanks=[superTank,dieselTank];
      if(!data.station||!Number.isFinite(Number(data.station.varianceTolerance))||Number(data.station.varianceTolerance)<0)data.station={...(data.station||{}),varianceTolerance:300};
      data.tanks.forEach(tank=>{if(!Number.isFinite(Number(tank.tolerance))||Number(tank.tolerance)<0)tank.tolerance=Number(data.station.varianceTolerance||300);});
      if(Array.isArray(data.nozzles))data.nozzles.forEach(nozzle=>{nozzle.fuel=fuelClass(nozzle.fuel||nozzle.fuelType||nozzle.label||nozzle.nozzleType);nozzle.tankId=tankIdForFuel(nozzle.fuel);if(data.station&&data.station.id)nozzle.stationId=data.station.id;});
      data.tanks.forEach(tank=>{if(data.station&&data.station.id)tank.stationId=data.station.id;tank.nozzles=(data.nozzles||[]).filter(nozzle=>nozzle.tankId===tank.id).map(nozzle=>nozzle.id);});
      return data;
    }
    function migrateSchema2State(previous) {
      const migrated=JSON.parse(JSON.stringify(previous));
      const oldCapacities=(migrated.tanks||[]).map(tank=>`${tank.fuel} ${num(tank.capacity,0)} L`).join(' · ');
      migrated.schema=3;
      applyTankCapacities(migrated,true);
      ['priceRequests','priceHistory','meterRequests','meterAdjustments','adjustments','discrepancies','maintenance','stockReadings','deliveries','deposits','audit'].forEach(key=>{if(!Array.isArray(migrated[key]))migrated[key]=[];});
      applySalesDepositPolicy(migrated);
      migrated.audit.unshift({id:makeId('AUD'),at:new Date().toISOString(),user:'System',role:'System',action:'Underground tank capacity specification updated',record:migrated.station.name||'Station 01',oldValue:oldCapacities,newValue:'Super 60,000 L · Diesel 45,000 L',reason:'Existing stock balances, transactions and historical activity were preserved.'});
      ensureDispenserSetup(migrated,migrated.station&&migrated.station.dispenserCount);
      migrationNotice='Tank capacities are now Super 60,000 L and Diesel 45,000 L. Existing balances and historical station records were retained.';
      return migrated;
    }
    let stationDirectory=null;
    let activeStationId='';
    function cloneJson(value){return JSON.parse(JSON.stringify(value));}
    function normalizePriceLevels(raw,nozzles=[]){
      const level=fuel=>{
        const fromConfig=raw&&Number(raw[fuel]);
        if(Number.isFinite(fromConfig)&&fromConfig>0)return Number(fromConfig.toFixed(2));
        const nozzle=(Array.isArray(nozzles)?nozzles:[]).find(item=>fuelClass(item.fuel||item.fuelType||item.label||item.nozzleType)===fuel&&Number(item.price)>0);
        return Number(nozzle?Number(nozzle.price).toFixed(2):(fuel==='Diesel'?15.9:14.75));
      };
      return {Petrol:level('Petrol'),Diesel:level('Diesel')};
    }
    function applyGlobalPriceLevels(data){
      if(!data||!Array.isArray(data.nozzles)||!stationDirectory||!stationDirectory.priceLevels)return data;
      data.nozzles.forEach(nozzle=>{const fuel=fuelClass(nozzle.fuel||nozzle.fuelType||nozzle.label||nozzle.nozzleType),price=Number(stationDirectory.priceLevels[fuel]);if(Number.isFinite(price)&&price>0)nozzle.price=price;});
      return data;
    }
    function allStationReviewQueueCount(){
      return (stationDirectory&&Array.isArray(stationDirectory.stations)?stationDirectory.stations:[]).reduce((total,entry)=>{const data=entry.data||{};return total+(Array.isArray(data.deliveries)?data.deliveries.filter(row=>row.status==='pending').length:0)+(Array.isArray(data.meterRequests)?data.meterRequests.filter(row=>row.status==='pending').length:0)+(Array.isArray(data.priceRequests)?data.priceRequests.filter(row=>row.status==='pending').length:0)+(Array.isArray(data.deposits)?data.deposits.filter(row=>row.workflow===DEPOSIT_WORKFLOW&&row.status==='Pending manager approval').length:0)+(Array.isArray(data.discrepancies)?data.discrepancies.filter(row=>row.status==='Open').length:0);},0);
    }
    function stationEntryById(id){return stationDirectory&&stationDirectory.stations.find(entry=>entry.id===String(id))||null;}
    function assignedStationIds(user){return Array.isArray(user&&user.stationIds)?[...new Set(user.stationIds.map(String))]:[];}
    function stationDataOnly(data){const copy=cloneJson(data);delete copy.users;return copy;}
    function stampStationContext(data){
      const id=String(data&&data.station&&data.station.id||activeStationId||'ST-01');
      if(!data||!data.station)return data;
      data.station.id=id;
      (data.tanks||[]).forEach(tank=>{tank.stationId=id;});
      (data.dispensers||[]).forEach(dispenser=>{dispenser.stationId=id;});
      (data.nozzles||[]).forEach(nozzle=>{nozzle.stationId=id;});
      STATION_RECORD_COLLECTIONS.forEach(key=>{(Array.isArray(data[key])?data[key]:[]).forEach(record=>{if(record&&typeof record==='object')record.stationId=id;});});
      return data;
    }
    /* =====================================================================
       PERSISTENCE v2 · IndexedDB primary database
       ---------------------------------------------------------------------
       • IndexedDB is the system of record. localStorage holds preferences only
         (theme, sidebar state) and is never used for operational records.
       • Every save is ONE atomic IndexedDB transaction across stations, users,
         records, the transaction ledger, the journal and the directory meta.
       • A commit "intent" marker is written first and removed inside the atomic
         commit, so an interrupted save is detected on the next start.
       • Optimistic revision check: a commit is rejected if another tab saved
         first; the app reloads the last consistent state instead of overwriting.
       • Ledger: critical operations (delivery decisions, receipts, deposit and
         meter decisions, price decisions, stock adjustments) register a unique
         transaction id. The ledger store's primary key makes a second posting
         physically impossible to commit.
       • Versioned, checksum-verified recovery snapshots with a retention policy.
       ===================================================================== */
    const DB_NAME='icon-energy-operations-db';
    const DB_VERSION=1;
    const DB_DIRECTORY_SCHEMA=6;
    const BACKUP_FORMAT='icon-energy-full-backup';
    const BACKUP_FORMAT_VERSION=1;
    const STORAGE_SETTING_DEFAULTS={retention:20,intervalMinutes:10,revisionInterval:25};
    const RETENTION_CHOICES=[5,10,20,30,50];
    const INTERVAL_CHOICES=[5,10,15,30,60];
    const JOURNAL_LIMIT=250;
    const PBKDF2_ITERATIONS=210000;
    const PBKDF2_FALLBACK_ITERATIONS=25000;
    let dbPromise=null;
    let committed={directory:null,split:null,revision:0};
    let saveChain=Promise.resolve();
    let saveQueued=false;
    let pendingLedger=[];
    let knownLedger=new Set();
    let storageSettings={...STORAGE_SETTING_DEFAULTS};
    let lastSnapshot={at:0,revision:0,checksum:''};
    let externalReloadPending=false;
    let retryTimer=null,retryDelay=2000;
    /* Accounts. The workspace auto-configures a default authorized Manager account at initialization
       (DEFAULT_MANAGER_USERNAME / documented first sign-in password below). The workspace cannot be
       used until that password is replaced at first sign-in; Supervisor accounts are created by the
       Manager afterwards. Only PBKDF2-SHA256 hashes are ever stored. */
    const DEFAULT_ORGANIZATION_NAME='ICON Energy';
    const DEFAULT_MANAGER_USERNAME='manager';
    const DEFAULT_MANAGER_NAME='Authorized Manager';
    const DEFAULT_MANAGER_PASSWORD='Manager@2026'; // first sign-in only — forced replacement at login
    function managerAccount(){return stationDirectory&&stationDirectory.manager&&stationDirectory.manager.username?stationDirectory.manager:null;}
    function defaultManagerPending(){const manager=managerAccount();return Boolean(manager&&manager.mustChangePassword);}
    /* Auto-provisioning: guarantee an organisation profile and the default Manager account exist as soon
       as the workspace initializes, before any sign-in. The Manager can then modify company information,
       change their own password and provision child stations; the setup wizard remains only as the
       fallback for restoring backups onto a completely empty device. */
    async function ensureDefaultManagerAccount(options={}){
      if(!stationDirectory)return false;
      const now=new Date().toISOString();
      let changed=false;
      if(!stationDirectory.organization||!String(stationDirectory.organization.name||'').trim()){
        stationDirectory.organization={...(stationDirectory.organization||{}),name:DEFAULT_ORGANIZATION_NAME,createdAt:stationDirectory.organization&&stationDirectory.organization.createdAt||now};
        changed=true;
      }
      if(!managerAccount()){
        stationDirectory.manager={id:'USR-MANAGER',role:'manager',username:DEFAULT_MANAGER_USERNAME,name:DEFAULT_MANAGER_NAME,initials:initialsFor(DEFAULT_MANAGER_NAME),createdAt:now,createdBy:'System initialization',mustChangePassword:true,...await createPasswordRecord(DEFAULT_MANAGER_PASSWORD)};
        changed=true;
        addAudit('Default Manager account provisioned',DEFAULT_MANAGER_USERNAME,'No Manager account','Auto-configured at system initialization',`Default sign-in “${DEFAULT_MANAGER_USERNAME}”; a new password is mandatory at first sign-in. Only the PBKDF2 hash is stored.`);
      }
      if(changed&&options.persist!==false)persistDirectorySnapshot({action:'Default workspace provisioning'});
      return changed;
    }
    function orgName(){const name=stationDirectory&&stationDirectory.organization&&String(stationDirectory.organization.name||'').trim();return name||'Station Operations';}
    function fileSlug(value){return String(value||'station').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'station';}
    function initialsFor(name){return String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0].toUpperCase()).join('')||'M';}
    const PASSWORD_RULE='At least 10 characters, including a letter and a number.';
    function passwordProblem(password){const value=String(password||'');if(value.length<10)return 'Use at least 10 characters.';if(!/[A-Za-z]/.test(value)||!/\d/.test(value))return 'Include at least one letter and one number.';return '';}
    function needsSetup(){return !bootRestorePending&&!managerAccount();}
    function workspaceHasRecords(){return Boolean(stationDirectory&&((stationDirectory.users||[]).length||(stationDirectory.stations||[]).some(site=>stationRecordCount(site.data||{})>0)));}
    let storageWarningShown=false;
    let saveStatus={kind:'boot',text:'Opening local database…',at:''};
    const opsChannel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('icon-energy-ops'):null;

    /* ---------- small helpers ---------- */
    function autosaveChecksum(value){
      let hash=2166136261;const text=String(value||'');
      for(let index=0;index<text.length;index+=1){hash^=text.charCodeAt(index);hash=Math.imul(hash,16777619);}
      return `fnv1a-${(hash>>>0).toString(16).padStart(8,'0')}`;
    }
    function hasSubtleCrypto(){return typeof crypto!=='undefined'&&crypto.subtle&&typeof crypto.subtle.digest==='function';}
    function bytesToHex(bytes){return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');}
    function hexToBytes(hex){const out=new Uint8Array(hex.length/2);for(let i=0;i<out.length;i+=1)out[i]=parseInt(hex.substr(i*2,2),16);return out;}
    function randomHex(length=16){const bytes=new Uint8Array(length);if(typeof crypto!=='undefined'&&crypto.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<length;i+=1)bytes[i]=Math.floor(Math.random()*256);return bytesToHex(bytes);}
    /* Pure-JS SHA-256 / HMAC / PBKDF2 — used only where WebCrypto is unavailable (insecure origins). */
    const SHA_K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    function sha256Bytes(data){
      const bitLength=data.length*8,padded=new Uint8Array(((data.length+9+63)>>6)<<6);padded.set(data);padded[data.length]=0x80;
      const view=new DataView(padded.buffer);view.setUint32(padded.length-4,bitLength>>>0);view.setUint32(padded.length-8,Math.floor(bitLength/4294967296));
      const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),w=new Uint32Array(64);
      for(let offset=0;offset<padded.length;offset+=64){
        for(let i=0;i<16;i+=1)w[i]=view.getUint32(offset+i*4);
        for(let i=16;i<64;i+=1){const a=w[i-15],b=w[i-2];const s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3),s1=((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
        let [a,b,c,d,e,f,g,k]=h;
        for(let i=0;i<64;i+=1){const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)),ch=(e&f)^(~e&g),t1=(k+S1+ch+SHA_K[i]+w[i])>>>0,S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)),maj=(a&b)^(a&c)^(b&c),t2=(S0+maj)>>>0;k=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
        h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+k)>>>0;
      }
      const out=new Uint8Array(32),outView=new DataView(out.buffer);h.forEach((value,index)=>outView.setUint32(index*4,value));return out;
    }
    function hmacSha256(key,message){
      let k=key.length>64?sha256Bytes(key):key;const block=new Uint8Array(64);block.set(k);
      const inner=new Uint8Array(64+message.length),outer=new Uint8Array(96);
      for(let i=0;i<64;i+=1){inner[i]=block[i]^0x36;outer[i]=block[i]^0x5c;}
      inner.set(message,64);outer.set(sha256Bytes(inner),64);return sha256Bytes(outer);
    }
    function pbkdf2Fallback(passwordBytes,salt,iterations){
      const saltBlock=new Uint8Array(salt.length+4);saltBlock.set(salt);saltBlock[salt.length+3]=1;
      let u=hmacSha256(passwordBytes,saltBlock);const result=u.slice();
      for(let i=1;i<iterations;i+=1){u=hmacSha256(passwordBytes,u);for(let j=0;j<32;j+=1)result[j]^=u[j];}
      return result;
    }
    async function sha256Hex(text){
      const bytes=new TextEncoder().encode(String(text));
      if(hasSubtleCrypto()){try{return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}catch(error){/* fall through */}}
      return bytesToHex(sha256Bytes(bytes));
    }
    async function derivePasswordHash(password,saltHex,iterations){
      const passwordBytes=new TextEncoder().encode(String(password)),salt=hexToBytes(saltHex);
      if(hasSubtleCrypto()&&crypto.subtle.importKey){
        try{const key=await crypto.subtle.importKey('raw',passwordBytes,'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);return bytesToHex(new Uint8Array(bits));}catch(error){/* fall through */}
      }
      return bytesToHex(pbkdf2Fallback(passwordBytes,salt,iterations));
    }
    async function createPasswordRecord(password){
      const salt=randomHex(16),iterations=hasSubtleCrypto()?PBKDF2_ITERATIONS:PBKDF2_FALLBACK_ITERATIONS;
      return {passwordHash:await derivePasswordHash(password,salt,iterations),passwordSalt:salt,passwordIterations:iterations,passwordAlgorithm:'PBKDF2-SHA256'};
    }
    function constantTimeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i+=1)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
    async function verifyPassword(account,password){
      if(!account)return false;
      if(account.passwordHash&&account.passwordSalt){const hash=await derivePasswordHash(password,account.passwordSalt,Number(account.passwordIterations)||PBKDF2_ITERATIONS);return constantTimeEqual(hash,account.passwordHash);}
      if(typeof account.password==='string')return constantTimeEqual(account.password,String(password)); // transient in-memory only, before first secure commit
      return false;
    }
    async function secureUserDirectory(){
      const users=stationDirectory&&Array.isArray(stationDirectory.users)?stationDirectory.users:[];
      for(const user of users){
        if(typeof user.password==='string'&&user.password){Object.assign(user,await createPasswordRecord(user.password));}
        delete user.password;
      }
      if(state&&Array.isArray(state.users)&&state.users!==users)state.users=users;
      const manager=stationDirectory&&stationDirectory.manager;if(manager){if(typeof manager.password==='string'&&manager.password)Object.assign(manager,await createPasswordRecord(manager.password));delete manager.password;}
    }

    /* ---------- payload validation ---------- */
    function validAutosavePayload(value){
      if(!value||typeof value!=='object')return false;
      if(Array.isArray(value.stations))return value.stations.length>0&&value.stations.every(site=>site&&typeof site==='object'&&site.data&&typeof site.data==='object'&&String(site.id||site.data.station&&site.data.station.id||''));
      return [1,2,3].includes(Number(value.schema))&&value.station&&Array.isArray(value.tanks)&&Array.isArray(value.readings);
    }
    function decodeAutosaveRecord(raw,source='unknown'){
      try{
        let record=raw;if(typeof raw==='string')record=JSON.parse(raw);
        if(record&&record.format===AUTOSAVE_FORMAT&&record.payload){
          const payload=typeof record.payload==='string'?JSON.parse(record.payload):record.payload,serialized=JSON.stringify(payload);
          if(!validAutosavePayload(payload)||autosaveChecksum(serialized)!==record.checksum)return null;
          return {revision:Math.max(0,Number(record.revision)||0),createdAt:record.createdAt||'',payload,source};
        }
        if(validAutosavePayload(record))return {revision:0,createdAt:'',payload:record,source};
      }catch(error){return null;}
      return null;
    }

    /* ---------- IndexedDB plumbing ---------- */
    function openDatabase(){
      if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB is not available in this browser context.'));
      if(dbPromise)return dbPromise;
      dbPromise=new Promise((resolve,reject)=>{
        let request;try{request=indexedDB.open(DB_NAME,DB_VERSION);}catch(error){reject(error);return;}
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta',{keyPath:'key'});
          if(!db.objectStoreNames.contains('stations'))db.createObjectStore('stations',{keyPath:'id'});
          if(!db.objectStoreNames.contains('users')){const users=db.createObjectStore('users',{keyPath:'id'});users.createIndex('username','username',{unique:true});}
          if(!db.objectStoreNames.contains('records')){const records=db.createObjectStore('records',{keyPath:'uid'});records.createIndex('byStationCollection',['stationId','collection'],{unique:false});records.createIndex('byStation','stationId',{unique:false});}
          if(!db.objectStoreNames.contains('ledger')){const ledger=db.createObjectStore('ledger',{keyPath:'txnId'});ledger.createIndex('byRecord',['stationId','recordId'],{unique:false});}
          if(!db.objectStoreNames.contains('snapshots')){const snaps=db.createObjectStore('snapshots',{keyPath:'id'});snaps.createIndex('createdAt','createdAt',{unique:false});}
          if(!db.objectStoreNames.contains('journal'))db.createObjectStore('journal',{keyPath:'seq',autoIncrement:true});
        };
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};
        request.onerror=()=>reject(request.error||new Error('Could not open the browser database.'));
        request.onblocked=()=>reject(new Error('The browser database is blocked by another tab running this app. Close older tabs and retry.'));
      }).catch(error=>{dbPromise=null;throw error;});
      return dbPromise;
    }
    function idbResult(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
    function txDone(tx){return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Database transaction failed.'));tx.onabort=()=>reject(tx.error||tx.__reason||new Error('Database transaction was rolled back.'));});}

    /* ---------- directory <-> normalized rows ---------- */
    function autosaveRecordIdentityList(rows){
      const seen=new Map();return (Array.isArray(rows)?rows:[]).map((record,index)=>{const base=record&&record.id!=null?String(record.id):`__row-${index}`,occurrence=seen.get(base)||0;seen.set(base,occurrence+1);return occurrence?`${base}#${occurrence}`:base;});
    }
    function recordUid(stationId,collection,recordId){return `${stationId}|${collection}|${recordId}`;}
    function splitDirectory(directory){
      const stations=[],records=new Map(),users=new Map();
      (directory.stations||[]).forEach((site,stationIndex)=>{
        const config=cloneJson(site.data||{}),recordOrder={};delete config.users;
        STATION_RECORD_COLLECTIONS.forEach(collection=>{
          const rows=Array.isArray(config[collection])?config[collection]:[],ids=autosaveRecordIdentityList(rows);recordOrder[collection]=ids;
          rows.forEach((value,index)=>{const uid=recordUid(site.id,collection,ids[index]);records.set(uid,{uid,stationId:String(site.id),collection,recordId:ids[index],order:index,value});});
          delete config[collection];
        });
        stations.push({id:String(site.id),order:stationIndex,name:site.name,location:site.location,pumpCount:site.pumpCount,supervisorIds:site.supervisorIds||[],config,recordOrder});
      });
      (directory.users||[]).forEach((user,index)=>{const copy=cloneJson(user);delete copy.password;copy.order=index;copy.username=String(copy.username||copy.id).toLowerCase();users.set(String(copy.id),copy);});
      const manager=directory.manager?cloneJson(directory.manager):null;if(manager)delete manager.password;
      const meta={schema:DB_DIRECTORY_SCHEMA,activeStationId:directory.activeStationId,priceLevels:directory.priceLevels||null};
      // Only add the account keys when present, so directories saved before setup existed keep their checksum.
      if(directory.organization)meta.organization=cloneJson(directory.organization);
      if(manager)meta.manager=manager;
      return {meta,stations,users,records};
    }
    function assembleDirectory(metaRow,stationRows,userRows,recordRows){
      const byStation=new Map();
      recordRows.forEach(row=>{const key=`${row.stationId}|${row.collection}`;if(!byStation.has(key))byStation.set(key,[]);byStation.get(key).push(row);});
      const stations=stationRows.slice().sort((a,b)=>(a.order??0)-(b.order??0)).map(row=>{
        const data=cloneJson(row.config||{});
        STATION_RECORD_COLLECTIONS.forEach(collection=>{
          const order=Array.isArray(row.recordOrder&&row.recordOrder[collection])?row.recordOrder[collection]:[],orderMap=new Map(order.map((id,index)=>[id,index]));
          data[collection]=(byStation.get(`${row.id}|${collection}`)||[]).sort((a,b)=>(orderMap.has(a.recordId)?orderMap.get(a.recordId):a.order)-(orderMap.has(b.recordId)?orderMap.get(b.recordId):b.order)).map(item=>item.value);
        });
        return {id:row.id,name:row.name,location:row.location,pumpCount:row.pumpCount,supervisorIds:row.supervisorIds||[],data};
      });
      const users=userRows.slice().sort((a,b)=>(a.order??0)-(b.order??0)).map(row=>{const copy={...row};delete copy.order;return copy;});
      return {schema:5,activeStationId:metaRow&&metaRow.activeStationId||stations[0]&&stations[0].id,priceLevels:metaRow&&metaRow.priceLevels||null,organization:metaRow&&metaRow.organization||null,manager:metaRow&&metaRow.manager||null,users,stations};
    }
    function directoryCoreChecksum(split){
      return autosaveChecksum(JSON.stringify({meta:split.meta,stations:split.stations.map(row=>[row.id,row.name,row.pumpCount,Object.keys(row.recordOrder).map(key=>row.recordOrder[key].length)]),users:[...split.users.keys()].sort()}));
    }
    function deriveLedger(directory){
      const entries=[];
      (directory.stations||[]).forEach(site=>{
        const data=site.data||{},sid=String(site.id),add=(type,recordId,at,user,details)=>entries.push({txnId:`${type}:${sid}:${recordId}`,type,stationId:sid,recordId:String(recordId),at:at||'',user:user||'',details:details||'',derived:true});
        (data.deliveries||[]).forEach(d=>{if(d.approvalDecision&&d.status!=='pending')add('delivery-decision',d.id,d.approvalDecision.at,d.approvalDecision.approver,d.approvalDecision.decision);if(d.receivedAt&&d.status==='received')add('delivery-receipt',d.id,d.receivedAt,d.receivedBy,'received');});
        (data.deposits||[]).forEach(d=>{if(['Approved','Rejected'].includes(d.status))add('deposit-decision',d.id,d.approvalDecision&&d.approvalDecision.at,d.approvalDecision&&d.approvalDecision.approver,d.status);});
        (data.meterRequests||[]).forEach(r=>{if(r.status!=='pending'&&r.decision)add('meter-decision',r.id,r.decision.at,r.decision.approver,r.status);});
        (data.priceRequests||[]).forEach(r=>{if(r.status!=='pending'&&r.decision)add('price-decision',r.id,r.decision.at,r.decision.approver,r.status);});
        (data.discrepancies||[]).forEach(d=>{if(d.status!=='Open'&&d.reviewedAt)add('discrepancy-review',d.id,d.reviewedAt,d.reviewedBy,d.status);});
      });
      return entries;
    }
    /* Reserve a unique transaction id for a critical operation. Returns false when the operation was already processed. */
    function reserveTransaction(type,recordId,details=''){
      const txnId=`${type}:${activeStationId}:${recordId}`;
      if(knownLedger.has(txnId)||pendingLedger.some(entry=>entry.txnId===txnId))return null;
      const entry={txnId,type,stationId:String(activeStationId),recordId:String(recordId),at:new Date().toISOString(),user:currentUser?currentUser.name:'System',details:String(details||'')};
      pendingLedger.push(entry);return txnId;
    }
    function releaseTransaction(txnId){pendingLedger=pendingLedger.filter(entry=>entry.txnId!==txnId);}

    /* ---------- save status indicator ---------- */
    function setSaveStatus(kind,text){
      const previousKind=saveStatus&&saveStatus.kind;
      saveStatus={kind,text,at:new Date().toISOString()};autosaveRuntime.status=kind;
      document.documentElement.classList.toggle('is-saving',kind==='saving');
      const node=document.getElementById('save-status');if(node)node.outerHTML=saveStatusMarkup();
      if(kind==='saved'&&previousKind==='saving'){const fresh=document.getElementById('save-status');if(fresh)fresh.classList.add('just-saved');}
      const bootNode=document.getElementById('boot-status');if(bootNode&&kind!=='boot')bootNode.remove();
    }
    function saveStatusMarkup(){
      const kind=saveStatus.kind,icons={saving:'refresh',saved:'checkcircle',backup:'shield',error:'alert',unavailable:'alert',boot:'refresh',conflict:'alert'};
      const labels={saving:'Saving…',saved:autosaveRuntime.lastSavedAt?`Saved ${timeShort(autosaveRuntime.lastSavedAt)}`:'All changes saved',backup:'Recovery point saved',error:'Save failed · retry',unavailable:'Not saved · no database',boot:'Opening database…',conflict:'Reloaded latest data'};
      return `<button type="button" id="save-status" class="save-status is-${kind}" data-action="storage-status" aria-live="polite" title="${esc(saveStatus.text||labels[kind]||'')}">${icon(icons[kind]||'info',14)}<span>${esc(labels[kind]||saveStatus.text||'')}</span></button>`;
    }

    /* ---------- commit pipeline ---------- */
    function persistDirectorySnapshot(options={}){
      if(!stationDirectory||bootRestorePending||suppressAutosaveWrite)return null;
      if(!autosaveRuntime.indexedDB){setSaveStatus('unavailable','The browser database is unavailable. Changes exist only in this tab; download a full backup before closing.');return null;}
      if(saveQueued&&!options.force)return true;
      saveQueued=true;
      const action=options.action||autosaveRuntime.pendingAction||'Record update';autosaveRuntime.pendingAction='';
      setSaveStatus('saving','Saving changes to the local database…');
      saveChain=saveChain.then(()=>{saveQueued=false;return commitDirectory(action);}).catch(error=>handleCommitFailure(error));
      return true;
    }
    async function commitDirectory(action){
      await secureUserDirectory();
      stationDirectory.schema=5;stationDirectory.activeStationId=activeStationId||stationDirectory.activeStationId;
      const next=cloneJson(stationDirectory),nextSplit=splitDirectory(next),prev=committed.split||{stations:[],users:new Map(),records:new Map(),meta:{}};
      const ledgerEntries=pendingLedger.splice(0);
      const prevStations=new Map(prev.stations.map(row=>[row.id,row])),stationPuts=nextSplit.stations.filter(row=>JSON.stringify(row)!==JSON.stringify(prevStations.get(row.id))),stationDeletes=[...prevStations.keys()].filter(id=>!nextSplit.stations.some(row=>row.id===id));
      const userPuts=[...nextSplit.users.values()].filter(row=>JSON.stringify(row)!==JSON.stringify(prev.users.get(String(row.id)))),userDeletes=[...prev.users.keys()].filter(id=>!nextSplit.users.has(id));
      const recordPuts=[],recordDeletes=[];
      nextSplit.records.forEach((row,uid)=>{const old=prev.records.get(uid);if(!old||old.order!==row.order||JSON.stringify(old.value)!==JSON.stringify(row.value))recordPuts.push(row);});
      prev.records.forEach((row,uid)=>{if(!nextSplit.records.has(uid))recordDeletes.push(uid);});
      const metaChanged=JSON.stringify(nextSplit.meta)!==JSON.stringify(prev.meta);
      if(!stationPuts.length&&!stationDeletes.length&&!userPuts.length&&!userDeletes.length&&!recordPuts.length&&!recordDeletes.length&&!ledgerEntries.length&&!metaChanged){setSaveStatus('saved','All changes are saved in this browser’s local database.');return {noop:true};}
      const db=await openDatabase(),baseRevision=committed.revision,revision=baseRevision+1,at=new Date().toISOString();
      // 1) intent marker (separate transaction) — survives a crash during the commit below
      const intentTx=db.transaction('meta','readwrite');intentTx.objectStore('meta').put({key:'intent',baseRevision,revision,action,at,writerId:autosaveRuntime.writerId,user:currentUser?currentUser.name:'System'});await txDone(intentTx);
      // 2) atomic commit
      const tx=db.transaction(['meta','stations','users','records','ledger','journal'],'readwrite'),done=txDone(tx);
      const meta=tx.objectStore('meta'),stores={stations:tx.objectStore('stations'),users:tx.objectStore('users'),records:tx.objectStore('records'),ledger:tx.objectStore('ledger'),journal:tx.objectStore('journal')};
      const currentDir=meta.get('directory');
      currentDir.onsuccess=()=>{
        const stored=currentDir.result,storedRevision=stored?Number(stored.revision)||0:0;
        if(storedRevision!==baseRevision){tx.__reason=Object.assign(new Error(`Another tab saved revision ${storedRevision} first.`),{code:'conflict',storedRevision});tx.abort();return;}
        ledgerEntries.forEach(entry=>{const request=stores.ledger.add({...entry,revision});request.onerror=event=>{event.stopPropagation();tx.__reason=Object.assign(new Error(`${entry.type} for ${entry.recordId} was already processed.`),{code:'duplicate',entry});try{tx.abort();}catch(e){/* already aborting */}};});
        stationPuts.forEach(row=>stores.stations.put(row));stationDeletes.forEach(id=>stores.stations.delete(id));
        userPuts.forEach(row=>stores.users.put(row));userDeletes.forEach(id=>stores.users.delete(id));
        recordPuts.forEach(row=>stores.records.put({...row,revision,savedAt:at}));recordDeletes.forEach(uid=>stores.records.delete(uid));
        meta.put({key:'directory',...nextSplit.meta,revision,savedAt:at,writerId:autosaveRuntime.writerId,checksum:directoryCoreChecksum(nextSplit)});
        meta.delete('intent');
        stores.journal.add({revision,at,action,user:currentUser?currentUser.name:'System',stationId:activeStationId,counts:{records:recordPuts.length,deleted:recordDeletes.length,stations:stationPuts.length,users:userPuts.length,ledger:ledgerEntries.length},changes:recordPuts.slice(0,60).map(row=>row.uid).concat(recordDeletes.slice(0,20).map(uid=>`-${uid}`)),ledger:ledgerEntries.map(entry=>entry.txnId)});
      };
      try{await done;}catch(error){
        // abort rolled everything back; clear the intent marker we wrote
        try{const clean=db.transaction('meta','readwrite');clean.objectStore('meta').delete('intent');await txDone(clean);}catch(e){/* next boot will report it */}
        const reason=tx.__reason||error;if(!reason.code)pendingLedger=ledgerEntries.concat(pendingLedger);
        throw reason;
      }
      committed={directory:next,split:nextSplit,revision};
      ledgerEntries.forEach(entry=>knownLedger.add(entry.txnId));
      autosaveRuntime.revision=revision;autosaveRuntime.lastSavedAt=at;autosaveRuntime.lastError='';retryDelay=2000;clearTimeout(retryTimer);
      setSaveStatus('saved',`All changes saved at ${timeShort(at)} · revision ${revision}.`);
      if(opsChannel)try{opsChannel.postMessage({type:'commit',revision,writerId:autosaveRuntime.writerId});}catch(e){/* ignore */}
      pruneJournal(db).catch(()=>{});
      maybeSnapshot().catch(error=>autosaveWarning(`Recovery point could not be created: ${error.message||error}`,false));
      return {revision};
    }
    function handleCommitFailure(error){
      saveQueued=false;
      if(error&&(error.code==='conflict'||error.code==='duplicate')){
        const message=error.code==='duplicate'?`${error.message} The duplicate was blocked and the last consistent saved state was reloaded.`:'Another open tab saved changes first. Your last action was not applied; the latest saved records were reloaded. Please repeat it if still needed.';
        setSaveStatus('conflict',message);
        return reloadFromDatabase({quiet:true}).then(()=>notify(error.code==='duplicate'?'Duplicate transaction blocked':'Records updated elsewhere',message,true));
      }
      autosaveRuntime.lastError=String(error&&error.message||error);
      setSaveStatus('error',`The last change could not be saved: ${autosaveRuntime.lastError}. It is kept in this tab and will be retried automatically.`);
      autosaveWarning(`Saving failed: ${autosaveRuntime.lastError}. Retrying automatically; download a full backup if this persists.`,true);
      clearTimeout(retryTimer);retryTimer=setTimeout(()=>{persistDirectorySnapshot({action:'Automatic retry',force:true});},retryDelay);retryDelay=Math.min(60000,retryDelay*2);
    }
    async function pruneJournal(db){
      const tx=db.transaction('journal','readwrite'),store=tx.objectStore('journal'),count=await idbResult(store.count());
      if(count>JOURNAL_LIMIT){let toDelete=count-JOURNAL_LIMIT;const cursorRequest=store.openCursor();cursorRequest.onsuccess=()=>{const cursor=cursorRequest.result;if(cursor&&toDelete>0){cursor.delete();toDelete-=1;cursor.continue();}};}
      await txDone(tx);
    }
    function autosaveWarning(message,error=false){
      autosaveRuntime.lastWarning=message;if(error)autosaveRuntime.lastError=message;
      if(autosaveRuntime.ready&&!autosaveRuntime.warningNotified){autosaveRuntime.warningNotified=true;setTimeout(()=>{notify('Local storage warning',message,true);autosaveRuntime.warningNotified=false;},0);}
    }

    /* ---------- loading ---------- */
    async function readDatabase(){
      const db=await openDatabase(),tx=db.transaction(['meta','stations','users','records','ledger','snapshots'],'readonly'),done=txDone(tx);
      const meta=tx.objectStore('meta'),req={directory:meta.get('directory'),lastExport:meta.get('lastExport'),intent:meta.get('intent'),settings:meta.get('settings'),stations:tx.objectStore('stations').getAll(),users:tx.objectStore('users').getAll(),records:tx.objectStore('records').getAll(),ledger:tx.objectStore('ledger').getAllKeys(),snapshotCount:tx.objectStore('snapshots').count()};
      const latestSnapshot=tx.objectStore('snapshots').index('createdAt').openCursor(null,'prev');let latest=null;latestSnapshot.onsuccess=()=>{const cursor=latestSnapshot.result;if(cursor){const value=cursor.value;latest={id:value.id,createdAt:value.createdAt,revision:value.revision,checksum:value.checksum};}};
      await done;
      if(req.lastExport.result&&req.lastExport.result.at)autosaveRuntime.lastExportAt=req.lastExport.result.at;
      const out={metaRow:req.directory.result||null,intent:req.intent.result||null,settings:req.settings.result||null,ledger:req.ledger.result||[],snapshotCount:req.snapshotCount.result||0,latestSnapshot:latest,directory:null,checksumOk:true};
      if(out.metaRow){
        out.directory=assembleDirectory(out.metaRow,req.stations.result||[],req.users.result||[],req.records.result||[]);
        out.checksumOk=directoryCoreChecksum(splitDirectory(out.directory))===out.metaRow.checksum;
      }
      return out;
    }
    function adoptCommittedDirectory(directory,revision){
      committed={directory:cloneJson(directory),split:splitDirectory(directory),revision:Number(revision)||0};
      autosaveRuntime.revision=committed.revision;
    }
    function applyLoadedDirectory(directory){
      suppressAutosaveWrite=true;
      try{state=hydrateStationDirectory(cloneJson(directory));}finally{suppressAutosaveWrite=false;}
    }
    async function reloadFromDatabase(options={}){
      try{
        const loaded=await readDatabase();if(!loaded.directory)return false;
        const prior=currentUser;
        adoptCommittedDirectory(loaded.directory,loaded.metaRow.revision);knownLedger=new Set(loaded.ledger);
        const keepStation=activeStationId;applyLoadedDirectory(loaded.directory);
        if(stationEntryById(keepStation)&&keepStation!==activeStationId){activeStationId=keepStation;stationDirectory.activeStationId=keepStation;state=hydrateStationEntry(stationEntryById(keepStation));}
        if(prior&&prior.role==='supervisor'){
          const account=stationDirectory.users.find(user=>user.id===prior.id),allowed=assignedStationIds(account);
          if(!account||!allowed.length){currentUser=null;loginError='Your station access changed. Ask the Manager to assign your account to a station, then sign in again.';}
          else{if(!allowed.includes(activeStationId)){activeStationId=allowed[0];stationDirectory.activeStationId=activeStationId;state=hydrateStationEntry(stationEntryById(activeStationId));}currentUser=sessionUser(account,{stationIds:allowed});}
        }
        autosaveRuntime.lastSavedAt=loaded.metaRow.savedAt||autosaveRuntime.lastSavedAt;externalReloadPending=false;
        if(!options.quiet)setSaveStatus('saved','Loaded the latest saved records.');
        queueRender();return true;
      }catch(error){autosaveWarning(`Could not reload saved records: ${error.message||error}`,true);return false;}
    }
    function legacyLocalCandidates(){
      const candidates=[];
      try{const current=localStorage.getItem(STORAGE_KEY);if(current){const decoded=decodeAutosaveRecord(current,'legacy-local');if(decoded)candidates.push(decoded);else autosaveRuntime.corruptRaw=current;}}catch(error){/* storage blocked */}
      try{const raw=localStorage.getItem(AUTOSAVE_BACKUP_KEY);if(raw){const versions=JSON.parse(raw);if(Array.isArray(versions))versions.forEach((version,index)=>{const decoded=decodeAutosaveRecord(version,`legacy-local-backup-${index}`);if(decoded)candidates.push(decoded);});}}catch(error){/* ignore */}
      return candidates;
    }
    function legacyDatabaseCandidates(){
      if(typeof indexedDB==='undefined')return Promise.resolve([]);
      return new Promise(resolve=>{
        let request;try{request=indexedDB.open(AUTOSAVE_DB_NAME);}catch(error){resolve([]);return;}
        request.onupgradeneeded=()=>{request.transaction.abort();};
        request.onerror=()=>resolve([]);
        request.onsuccess=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('meta')){db.close();resolve([]);return;}
          try{
            const stores=['meta'].concat(db.objectStoreNames.contains('backups')?['backups']:[]),tx=db.transaction(stores,'readonly'),current=tx.objectStore('meta').get('current'),backups=stores.includes('backups')?tx.objectStore('backups').getAll():null;
            tx.oncomplete=()=>{const out=[];const c=decodeAutosaveRecord(current.result,'legacy-indexeddb');if(c)out.push(c);(backups&&backups.result||[]).forEach((row,index)=>{const d=decodeAutosaveRecord(row,`legacy-indexeddb-backup-${index}`);if(d)out.push(d);});db.close();resolve(out);};
            tx.onerror=()=>{db.close();resolve([]);};
          }catch(error){db.close();resolve([]);}
        };
      });
    }
    function hydrateLegacyPayload(saved){
      if(saved&&(saved.schema===4||saved.schema===5)&&Array.isArray(saved.stations))return hydrateStationDirectory(saved);
      if(saved&&saved.schema===3&&saved.station&&Array.isArray(saved.tanks)&&saved.tanks.length===2&&Array.isArray(saved.nozzles)&&Array.isArray(saved.dispensers)&&Array.isArray(saved.readings)){STATION_RECORD_COLLECTIONS.forEach(key=>{if(!Array.isArray(saved[key]))saved[key]=[];});saved.users=Array.isArray(saved.users)?saved.users:[];applySalesDepositPolicy(saved);applyTankCapacities(saved,true);ensureDispenserSetup(saved,saved.station&&saved.station.dispenserCount);return wrapSingleStation(saved);}
      if(saved&&saved.schema===2&&saved.station&&Array.isArray(saved.tanks))return wrapSingleStation(migrateSchema2State(saved));
      if(saved&&saved.schema===1&&Array.isArray(saved.tanks)&&Array.isArray(saved.readings))return wrapSingleStation(migrateLegacyState(saved));
      return null;
    }
    function removeLegacyLocalRecords(){
      [STORAGE_KEY,AUTOSAVE_BACKUP_KEY,AUTOSAVE_QUARANTINE_KEY].forEach(key=>{try{localStorage.removeItem(key);}catch(error){/* ignore */}});
    }

    /* Writes a complete directory atomically (initial database, restore, import). */
    async function replaceDatabaseContents(directory,action){
      const db=await openDatabase(),split=splitDirectory(directory),revision=committed.revision+1,at=new Date().toISOString(),ledger=deriveLedger(directory);
      const tx=db.transaction(['meta','stations','users','records','ledger','journal'],'readwrite'),done=txDone(tx);
      ['stations','users','records','ledger'].forEach(name=>tx.objectStore(name).clear());
      split.stations.forEach(row=>tx.objectStore('stations').put(row));
      split.users.forEach(row=>tx.objectStore('users').put(row));
      split.records.forEach(row=>tx.objectStore('records').put({...row,revision,savedAt:at}));
      ledger.forEach(entry=>tx.objectStore('ledger').put({...entry,revision}));
      tx.objectStore('meta').put({key:'directory',...split.meta,revision,savedAt:at,writerId:autosaveRuntime.writerId,checksum:directoryCoreChecksum(split)});
      tx.objectStore('meta').delete('intent');
      tx.objectStore('journal').add({revision,at,action,user:currentUser?currentUser.name:'System',counts:{records:split.records.size,stations:split.stations.length,users:split.users.size,ledger:ledger.length},replace:true});
      await done;
      committed={directory:cloneJson(directory),split,revision};knownLedger=new Set(ledger.map(entry=>entry.txnId));pendingLedger=[];
      autosaveRuntime.revision=revision;autosaveRuntime.lastSavedAt=at;
      if(opsChannel)try{opsChannel.postMessage({type:'commit',revision,writerId:autosaveRuntime.writerId});}catch(e){/* ignore */}
      return revision;
    }

    /* ---------- recovery snapshots ---------- */
    async function maybeSnapshot(){
      const now=Date.now(),interval=Number(storageSettings.intervalMinutes||10)*60000;
      if(now-lastSnapshot.at>=interval||committed.revision-lastSnapshot.revision>=Number(storageSettings.revisionInterval||25))return createSnapshot('Automatic recovery point');
      return null;
    }
    async function createSnapshot(reason,options={}){
      if(!committed.directory)return null;
      const payload=JSON.stringify(committed.directory),checksum=await sha256Hex(payload);
      if(!options.force&&checksum===lastSnapshot.checksum){lastSnapshot.at=Date.now();return null;}
      const db=await openDatabase(),createdAt=new Date().toISOString(),id=`SNP-${String(committed.revision).padStart(6,'0')}-${Date.now().toString(36)}`;
      const stations=committed.directory.stations||[],recordCount=stations.reduce((sum,site)=>sum+stationRecordCount(site.data||{}),0);
      const tx=db.transaction('snapshots','readwrite'),done=txDone(tx),store=tx.objectStore('snapshots');
      store.put({id,createdAt,revision:committed.revision,reason,algorithm:hasSubtleCrypto()?'SHA-256':'SHA-256 (js)',checksum,size:payload.length,stationCount:stations.length,userCount:(committed.directory.users||[]).length,recordCount,pinned:Boolean(options.pinned),payload});
      const keys=store.index('createdAt').getAllKeys();
      keys.onsuccess=()=>{const all=keys.result||[],limit=Math.max(3,Number(storageSettings.retention)||20);if(all.length+1>limit){/* keys are ordered oldest → newest */all.slice(0,all.length+1-limit).forEach(key=>{if(key!==id)store.delete(key);});}};
      await done;
      lastSnapshot={at:Date.now(),revision:committed.revision,checksum};
      autosaveRuntime.lastSnapshotAt=createdAt;autosaveRuntime.backupCount=Math.min(Number(storageSettings.retention)||20,(Number(autosaveRuntime.backupCount)||0)+1);
      if(!options.silent)setSaveStatus('backup',`Recovery point saved at ${timeShort(createdAt)} (${reason}).`);
      if(!options.silent)setTimeout(()=>{if(saveStatus.kind==='backup')setSaveStatus('saved','All changes saved.');},2600);
      checkStorageEstimate().catch(()=>{});
      return id;
    }
    async function listSnapshots(){
      const db=await openDatabase(),tx=db.transaction('snapshots','readonly'),done=txDone(tx),rows=[];
      const cursor=tx.objectStore('snapshots').index('createdAt').openCursor(null,'prev');
      cursor.onsuccess=()=>{const c=cursor.result;if(c){const {payload,...meta}=c.value;rows.push(meta);c.continue();}};
      await done;autosaveRuntime.backupCount=rows.length;return rows;
    }
    async function loadVerifiedSnapshot(id){
      const db=await openDatabase(),row=await idbResult(db.transaction('snapshots','readonly').objectStore('snapshots').get(String(id)));
      if(!row)throw new Error('That recovery point no longer exists.');
      const checksum=await sha256Hex(row.payload);if(checksum!==row.checksum)throw new Error('The recovery point failed its integrity check and was not restored.');
      const payload=JSON.parse(row.payload);if(!validAutosavePayload(payload))throw new Error('The recovery point structure is invalid.');
      return {row,payload};
    }
    async function saveStorageSettings(next){
      storageSettings={...storageSettings,...next};
      const db=await openDatabase(),tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:'settings',...storageSettings,updatedAt:new Date().toISOString(),updatedBy:currentUser?currentUser.name:'System'});await txDone(tx);
      const rows=await listSnapshots();
      if(rows.length>storageSettings.retention){const tx2=db.transaction('snapshots','readwrite'),store=tx2.objectStore('snapshots');rows.slice(storageSettings.retention).forEach(row=>store.delete(row.id));await txDone(tx2);autosaveRuntime.backupCount=storageSettings.retention;}
    }
    async function checkStorageEstimate(){
      if(typeof navigator==='undefined'||!navigator.storage||typeof navigator.storage.estimate!=='function')return null;
      const {usage=0,quota=0}=await navigator.storage.estimate();autosaveRuntime.usage=usage;autosaveRuntime.quota=quota;
      const ratio=quota?usage/quota:0;
      if(quota&&(ratio>0.8||quota-usage<25*1024*1024)&&!storageWarningShown){storageWarningShown=true;autosaveWarning(`Browser storage is nearly full (${Math.round(ratio*100)}% of the available quota). Reduce the recovery-point retention or download and clear old data.`,false);}
      return {usage,quota};
    }
    async function requestPersistentBrowserStorage(){
      try{
        if(typeof navigator==='undefined'||!navigator.storage){autosaveRuntime.storagePersistent=false;return false;}
        const storage=navigator.storage,already=typeof storage.persisted==='function'?await storage.persisted():false;
        autosaveRuntime.storagePersistent=Boolean(already||(typeof storage.persist==='function'&&await storage.persist()));
      }catch(error){autosaveRuntime.storagePersistent=false;}
      if(currentUser&&activePage==='data')render();
      return autosaveRuntime.storagePersistent;
    }

    /* ---------- boot ---------- */
    async function initializeAutosaveRecovery(){
      const notices=[];
      try{await openDatabase();autosaveRuntime.indexedDB=true;}
      catch(error){
        autosaveRuntime.indexedDB=false;await ensureDefaultManagerAccount();await secureUserDirectory();
        bootRestorePending=false;autosaveRuntime.ready=true;
        setSaveStatus('unavailable',`IndexedDB is unavailable (${error.message||error}). Records will NOT be saved after this tab closes.`);
        render();notify('Local database unavailable','This browser blocked IndexedDB, so records cannot be saved. Use a normal (non-private) window over http://localhost or HTTPS, or download a full backup before closing.',true);
        return;
      }
      const loaded=await readDatabase();
      if(loaded.settings)storageSettings={...STORAGE_SETTING_DEFAULTS,...loaded.settings};delete storageSettings.key;
      if(loaded.latestSnapshot)lastSnapshot={at:new Date(loaded.latestSnapshot.createdAt).getTime()||0,revision:Number(loaded.latestSnapshot.revision)||0,checksum:loaded.latestSnapshot.checksum||''};
      autosaveRuntime.backupCount=loaded.snapshotCount;autosaveRuntime.lastSnapshotAt=loaded.latestSnapshot?loaded.latestSnapshot.createdAt:'';
      if(loaded.intent){
        autosaveRuntime.incompleteOperation=loaded.intent;
        notices.push(['Incomplete save detected',`The change “${loaded.intent.action}” started at ${dateTime(loaded.intent.at)} did not finish saving (the browser closed or crashed). Records were restored to the last consistent save, revision ${loaded.metaRow?loaded.metaRow.revision:0}. Re-enter that change if it is missing.`,true]);
        try{const db=await openDatabase(),tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('intent');await txDone(tx);}catch(e){/* ignore */}
      }
      let directory=loaded.directory,revision=loaded.metaRow?Number(loaded.metaRow.revision)||0:0;
      if(directory&&!loaded.checksumOk){
        const snaps=await listSnapshots();let recovered=null;
        for(const snap of snaps){try{recovered=await loadVerifiedSnapshot(snap.id);break;}catch(e){/* try older */}}
        if(recovered){directory=recovered.payload;notices.push(['Database recovered',`The saved directory failed its integrity check, so the newest verified recovery point (${dateTime(recovered.row.createdAt)}) was restored.`,true]);committed.revision=revision;await secureAndReplace(directory,'Integrity recovery');revision=committed.revision;}
        else notices.push(['Database integrity warning','The saved directory checksum did not match and no verified recovery point was available. Records were loaded as-is; download a full backup and review them.',true]);
      }
      if(directory){
        adoptCommittedDirectory(directory,revision);knownLedger=new Set(loaded.ledger);
        applyLoadedDirectory(directory);
      }else{
        // First run on this database: migrate from earlier browser storage or start an empty workspace for setup.
        const candidates=[...legacyLocalCandidates(),...await legacyDatabaseCandidates()].sort((a,b)=>Number(b.revision||0)-Number(a.revision||0)||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
        const best=candidates[0];
        if(best){suppressAutosaveWrite=true;try{const hydrated=hydrateLegacyPayload(cloneJson(best.payload));if(hydrated)state=hydrated;}finally{suppressAutosaveWrite=false;}autosaveRuntime.migratedFrom=best.source;notices.push(['Records moved to the local database',`Your existing records (revision ${best.revision||'legacy'}) were migrated from older browser storage into IndexedDB. Plain-text passwords were replaced with salted hashes.`,false]);}
        else if(autosaveRuntime.corruptRaw)notices.push(['Saved data needs attention','Older saved data was unreadable, so a new empty workspace was opened. Restore a valid backup before entering new records.',true]);
        await secureAndReplace(stationDirectory,best?'Migrated from legacy browser storage':'Initial database');
        await createSnapshot(best?'Migration recovery point':'Initial recovery point',{force:true,silent:true,pinned:true});
        removeLegacyLocalRecords();
      }
      await ensureDefaultManagerAccount();
      await secureUserDirectory();
      bootRestorePending=false;autosaveRuntime.ready=true;autosaveRuntime.lastSavedAt=loaded.metaRow&&loaded.metaRow.savedAt||autosaveRuntime.lastSavedAt;
      setSaveStatus('saved','All records are loaded from the local database.');
      // Persist any normalisation (e.g. migrations applied during hydration, plaintext passwords hashed).
      if(JSON.stringify(splitDirectory(stationDirectory).stations)!==JSON.stringify(committed.split.stations)||[...splitDirectory(stationDirectory).users.values()].some(user=>!committed.split.users.has(String(user.id))))persistDirectorySnapshot({action:'Startup normalisation'});
      if(Date.now()-lastSnapshot.at>Number(storageSettings.intervalMinutes||10)*60000)createSnapshot('Session start recovery point',{silent:true}).catch(()=>{});
      checkStorageEstimate().catch(()=>{});
      if(opsChannel)opsChannel.onmessage=event=>{const data=event.data||{};if(data.type==='commit'&&data.writerId!==autosaveRuntime.writerId&&Number(data.revision)>committed.revision){if(modal){externalReloadPending=true;notify('Records changed in another tab','The latest records will load when you close this form. Saving now may be blocked to protect data integrity.');}else reloadFromDatabase({quiet:true}).then(()=>notify('Records refreshed','Changes saved in another tab were loaded.'));}};
      syncRouteFromHash();
      render();
      notices.forEach(([title,detail,isError],index)=>setTimeout(()=>notify(title,detail,isError),400+index*4200));
    }
    async function secureAndReplace(directory,action){
      await secureUserDirectory();
      const copy=cloneJson(directory);(copy.users||[]).forEach(user=>{delete user.password;});
      await replaceDatabaseContents(copy,action);
    }

    /* ---------- full backups (export / import) ---------- */
    async function buildFullBackup(){
      await secureUserDirectory();
      const data=cloneJson(stationDirectory);(data.users||[]).forEach(user=>{delete user.password;});
      const body=JSON.stringify(data),checksum=await sha256Hex(body),stations=data.stations||[];
      return {format:BACKUP_FORMAT,formatVersion:BACKUP_FORMAT_VERSION,application:'Station Operations',organization:orgName(),exportedAt:new Date().toISOString(),exportedBy:currentUser?currentUser.name:'System',databaseRevision:committed.revision,directorySchema:5,checksum:{algorithm:'SHA-256',value:checksum,over:'JSON.stringify(data)'},counts:{stations:stations.length,users:(data.users||[]).length,records:stations.reduce((sum,site)=>sum+stationRecordCount(site.data||{}),0)},settings:{...storageSettings},ledger:deriveLedger(data).map(({derived,...entry})=>entry),notes:'Contains every station, record, setting and the Supervisor directory (salted PBKDF2 password hashes only — never plain-text passwords). Store this file securely outside this device.',data};
    }
    async function exportFullBackup(){
      if(!isManager())return notify('Permission denied','Only the Manager can export a full workspace backup.',true);
      try{
        const backup=await buildFullBackup(),stamp=backup.exportedAt.replace(/[:]/g,'').replace(/\..+/,'');
        const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download=`${fileSlug(orgName())}-full-backup-${stamp}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
        autosaveRuntime.lastExportAt=backup.exportedAt;
        try{const db=await openDatabase(),tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:'lastExport',at:backup.exportedAt,by:backup.exportedBy,revision:backup.databaseRevision});await txDone(tx);}catch(e){/* informational only */}
        addAudit('Full workspace backup exported',`Revision ${backup.databaseRevision}`,'—',`${backup.counts.stations} stations · ${backup.counts.records} records`,'Downloaded JSON backup; store it outside this device.');saveState();
        notify('Full backup downloaded',`${backup.counts.stations} stations, ${backup.counts.records} records and ${backup.counts.users} Supervisor accounts. Move the file to secure storage off this device.`);
      }catch(error){notify('Backup export failed',String(error&&error.message||error),true);}
    }
    async function validateFullBackup(parsed){
      if(!parsed||parsed.format!==BACKUP_FORMAT)return {ok:false,error:'This is not a full backup file from this system.'};
      if(Number(parsed.formatVersion)>BACKUP_FORMAT_VERSION)return {ok:false,error:`Backup format version ${parsed.formatVersion} is newer than this application supports.`};
      if(!parsed.data||!validAutosavePayload(parsed.data))return {ok:false,error:'The backup data section is missing or structurally invalid.'};
      const checksum=await sha256Hex(JSON.stringify(parsed.data));
      if(!parsed.checksum||checksum!==parsed.checksum.value)return {ok:false,error:'Checksum mismatch: the file was modified or corrupted after export.'};
      if((parsed.data.users||[]).some(user=>typeof user.password==='string')||(parsed.data.manager&&typeof parsed.data.manager.password==='string'))return {ok:false,error:'The backup contains plain-text passwords and was rejected.'};
      return {ok:true,checksum};
    }
    async function restoreDirectory(directory,action,auditText){
      await createSnapshot(`Before ${action.toLowerCase()}`,{force:true,silent:true,pinned:true});
      await secureAndReplace(directory,action);
      applyLoadedDirectory(committed.directory);
      await ensureDefaultManagerAccount(); // a restored workspace always keeps a usable Manager account
      if(currentUser&&currentUser.role!=='manager'){currentUser=null;}
      if(currentUser&&currentUser.role==='manager'&&(!managerAccount()||String(managerAccount().username).toLowerCase()!==String(currentUser.username).toLowerCase()))currentUser=null;
      activePage=currentUser?'data':'dashboard';modal=null;
      addAudit(action,state.station.name,auditText[0],auditText[1],auditText[2]);saveState();
      render();
    }
    function hydrateStationEntry(entry){
      if(!entry)return makeSeedState();
      const fallback=makeSeedState();
      let data=entry.data&&typeof entry.data==='object'?cloneJson(entry.data):stationDataOnly(fallback);
      if(!data.station||!Array.isArray(data.tanks)||data.tanks.length!==2){data=stationDataOnly(fallback);}
      data.schema=3;
      data.station={...(data.station||{}),id:entry.id,name:entry.name||data.station.name||'Fuel station',location:entry.location||data.station.location||'',dispenserCount:Number(entry.pumpCount||data.station.dispenserCount||2)};
      STATION_RECORD_COLLECTIONS.forEach(key=>{if(!Array.isArray(data[key]))data[key]=[];});
      data.users=stationDirectory.users;
      applyTankCapacities(data);
      applyGlobalPriceLevels(data);
      const pumpCount=Math.max(1,Math.min(50,Math.floor(Number(entry.pumpCount||data.station.dispenserCount)||1)));
      ensureDispenserSetup(data,pumpCount);
      data.station.id=entry.id;data.station.name=entry.name||data.station.name;data.station.location=entry.location||data.station.location;data.station.dispenserCount=pumpCount;
      entry.pumpCount=pumpCount;entry.data=stationDataOnly(stampStationContext(data));
      entry.supervisorIds=stationDirectory.users.filter(user=>user.role==='supervisor'&&assignedStationIds(user).includes(entry.id)).map(user=>user.id);
      return data;
    }
    function hydrateStationDirectory(saved){
      const rawSites=Array.isArray(saved.stations)?saved.stations.filter(entry=>entry&&typeof entry==='object'):[];
      if(!rawSites.length)return wrapSingleStation(makeSeedState());
      const firstSiteId=String(rawSites[0].id||rawSites[0].data&&rawSites[0].data.station&&rawSites[0].data.station.id||'ST-01');
      let users=Array.isArray(saved.users)?saved.users:(rawSites.find(entry=>entry.data&&Array.isArray(entry.data.users))||{}).data?.users||[];
      const stations=rawSites.map((entry,index)=>{
        const id=String(entry.id||entry.data&&entry.data.station&&entry.data.station.id||(index===0?'ST-01':makeId('STA')));
        let data=entry.data&&typeof entry.data==='object'?cloneJson(entry.data):null;
        if(data){data.users=Array.isArray(data.users)?data.users:users;if(![1,2,3].includes(data.schema))data.schema=3;}
        if(data&&data.schema===1)data=migrateLegacyState(data);
        else if(data&&data.schema===2)data=migrateSchema2State(data);
        else if(data&&data.schema===3){STATION_RECORD_COLLECTIONS.forEach(key=>{if(!Array.isArray(data[key]))data[key]=[];});applySalesDepositPolicy(data);applyTankCapacities(data);}
        else data=stationDataOnly(makeSeedState());
        data.station={...(data.station||{}),id,name:String(entry.name||data.station.name||`Station ${index+1}`),location:String(entry.location||data.station.location||''),dispenserCount:Number(entry.pumpCount||data.station.dispenserCount||2)};
        ensureDispenserSetup(data,data.station.dispenserCount);
        return {id,name:data.station.name,location:data.station.location,pumpCount:data.station.dispenserCount,supervisorIds:Array.isArray(entry.supervisorIds)?entry.supervisorIds:[],data:stationDataOnly(data)};
      });
      const validIds=new Set(stations.map(entry=>entry.id));
      users=(Array.isArray(users)?users:[]).filter(user=>user&&user.role==='supervisor').map(user=>{
        const fromStationList=stations.filter(entry=>Array.isArray(entry.supervisorIds)&&entry.supervisorIds.includes(user.id)).map(entry=>entry.id);
        let ids=Array.isArray(user.stationIds)?user.stationIds.map(String).filter(id=>validIds.has(id)):fromStationList;
        if(!Array.isArray(user.stationIds)&&!ids.length)ids=[firstSiteId];
        return {...user,stationIds:[...new Set(ids)]};
      });
      stationDirectory={schema:5,activeStationId:String(saved.activeStationId||stations[0].id),users,stations,priceLevels:normalizePriceLevels(saved.priceLevels,stations[0].data.nozzles),organization:saved.organization||null,manager:saved.manager||null};
      stations.forEach(entry=>{entry.supervisorIds=users.filter(user=>assignedStationIds(user).includes(entry.id)).map(user=>user.id);const data=cloneJson(entry.data);applyGlobalPriceLevels(data);entry.data=stationDataOnly(data);});
      if(!validIds.has(stationDirectory.activeStationId))stationDirectory.activeStationId=stations[0].id;
      activeStationId=stationDirectory.activeStationId;
      const active=stationEntryById(activeStationId);
      const stateData=hydrateStationEntry(active);
      persistDirectorySnapshot();
      return stateData;
    }
    function wrapSingleStation(data){
      if(!data||!data.station)data=makeSeedState();
      data.station.id=String(data.station.id||'ST-01');
      data.station.name=String(data.station.name||'Main station');
      data.station.location=String(data.station.location||'');
      data.users=(Array.isArray(data.users)?data.users:[]).filter(user=>user&&user.role==='supervisor').map(user=>({...user,stationIds:Array.isArray(user.stationIds)&&user.stationIds.length?user.stationIds:[data.station.id]}));
      activeStationId=data.station.id;
      const keepOrganization=stationDirectory&&stationDirectory.organization||null,keepManager=stationDirectory&&stationDirectory.manager||null;
      stationDirectory={schema:5,activeStationId,users:data.users,stations:[{id:activeStationId,name:data.station.name,location:data.station.location,pumpCount:Number(data.station.dispenserCount||2),supervisorIds:data.users.map(user=>user.id),data:stationDataOnly(data)}],priceLevels:normalizePriceLevels(null,data.nozzles),organization:keepOrganization,manager:keepManager};
      data=hydrateStationEntry(stationDirectory.stations[0]);
      persistDirectorySnapshot();
      return data;
    }
    function loadState() {
      // Synchronous in-memory placeholder while IndexedDB opens; never written while bootRestorePending is true.
      return wrapSingleStation(makeSeedState());
    }
    let state = loadState();
    let currentUser = null;
    /* The signed-in session object never carries credential material (hash, salt, iterations). */
    function sessionUser(account,extra={}){const {password,passwordHash,passwordSalt,passwordIterations,passwordAlgorithm,...safe}=account||{};return {...safe,...extra};}
    let activePage = 'dashboard';
    let managerDashboardView = 'stock';
    let managerTankFuel = 'Petrol';
    // Manager dashboard landing: 'aggregate' = organization-wide overview across every managed station;
    // 'station' = drill-down of the active station (stock/sales/performance tabs). Station accounts never
    // enter this branch; a Manager account always sees aggregate totals first so it cannot be mistaken
    // for the data of a single station.
    let managerHomeMode = 'aggregate';
    let loginError = '';
    let modal = null;
    let toast = null;
    let toastTimer = null;
    let readingDate = TODAY;
    let depositDateFilter = activeDepositBusinessDate(new Date());
    let defaultDepositDate = depositDateFilter;
    let reportDate = TODAY;
    let selectedReport = 'tank-stock';
    let deliveryFilter = 'all';
    let discrepancyFilter = 'open';
    let lastDepositReminderSignature='';
    let lastDepositReminderToast='';

    function saveState() {
      if(stationDirectory&&activeStationId){
        stationDirectory.users=Array.isArray(state.users)?state.users:stationDirectory.users||[];
        const entry=stationEntryById(activeStationId);
        if(entry&&state.station){
          applyGlobalPriceLevels(state);
          state.station.id=activeStationId;
          entry.name=String(state.station.name||entry.name||'Fuel station');
          entry.location=String(state.station.location||entry.location||'');
          entry.pumpCount=Math.max(1,Math.min(50,Math.floor(Number(state.station.dispenserCount||state.dispensers.filter(dispenser=>dispenser.active).length)||1)));
          state.station.dispenserCount=entry.pumpCount;
          entry.supervisorIds=stationDirectory.users.filter(user=>user.role==='supervisor'&&assignedStationIds(user).includes(activeStationId)).map(user=>user.id);
          entry.data=stationDataOnly(stampStationContext(state));
        }
        stationDirectory.schema=5;stationDirectory.activeStationId=activeStationId;
        const lastAudit=state.audit&&state.audit[0];
        if(!autosaveRuntime.pendingAction)autosaveRuntime.pendingAction=lastAudit&&Date.now()-new Date(lastAudit.at).getTime()<3000?`${lastAudit.action} · ${lastAudit.record}`:'Record update';
        persistDirectorySnapshot();
        return;
      }
    }
    function addAudit(action, record, oldValue, newValue, reason) {
      state.audit.unshift({
        id: makeId('AUD'), at: new Date().toISOString(), user: currentUser ? currentUser.name : 'System',
        role: currentUser ? (currentUser.role === 'manager' ? 'Authorized Manager' : 'Supervisor') : 'System',
        stationId:activeStationId||state.station&&state.station.id||'',
        action, record, oldValue: oldValue || '—', newValue: newValue || '—', reason: reason || ''
      });
    }
    function stationRecordCount(data=state) {
      return ['readings','deliveries','deposits','stockReadings','adjustments','meterRequests','meterAdjustments','priceRequests','priceHistory','discrepancies','maintenance','audit'].reduce((sum,key)=>sum+(Array.isArray(data[key])?data[key].length:0),0);
    }
    function validateBackup(candidate) {
      if (!candidate || !candidate.station || !Array.isArray(candidate.tanks) || !candidate.tanks.every(t=>t&&typeof t.id==='string')) return false;
      if (candidate.schema === 1) return Array.isArray(candidate.nozzles) && Array.isArray(candidate.readings);
      if (![2,3].includes(candidate.schema) || candidate.tanks.length !== 2) return false;
      const fuels = candidate.tanks.map(t=>t.fuel);
      return fuels.includes('Petrol') && fuels.includes('Diesel') && Array.isArray(candidate.dispensers) && Array.isArray(candidate.nozzles) && (candidate.users===undefined||Array.isArray(candidate.users)) && Array.isArray(candidate.readings) && candidate.dispensers.every(d=>d&&typeof d.id==='string') && candidate.nozzles.every(n=>n&&typeof n.id==='string');
    }
    function normalizeBackup(candidate) {
      if(!validateBackup(candidate))return null;
      if(candidate.schema===1)return migrateLegacyState(candidate);
      if(candidate.schema===2)return migrateSchema2State(candidate);
      const copy=JSON.parse(JSON.stringify(candidate));
      ['adjustments','meterRequests','meterAdjustments','priceRequests','priceHistory','discrepancies','maintenance','audit','deliveries','deposits','stockReadings'].forEach(key=>{if(!Array.isArray(copy[key]))copy[key]=[];});
      applySalesDepositPolicy(copy);
      if(!Number.isFinite(Number(copy.station.varianceTolerance)))copy.station.varianceTolerance=200;
      applyTankCapacities(copy);
      ensureDispenserSetup(copy,copy.station.dispenserCount);
      return copy;
    }
    function clearOperationalState() {
      const empty=JSON.parse(JSON.stringify(state));
      ['readings','deliveries','deposits','stockReadings','adjustments','meterRequests','meterAdjustments','priceRequests','priceHistory','discrepancies','maintenance','audit'].forEach(key=>{empty[key]=[];});
      empty.tanks.forEach(tank=>{tank.openingStock=0;tank.physicalStock=0;tank.dipAt=null;});
      empty.nozzles.forEach(nozzle=>{nozzle.maintenance='Operational';});
      return empty;
    }
    function resetStationData() {
      if(!isManager())return notify('Permission denied','Only the Manager can clear station records.',true);
      const before=stationRecordCount(state),users=stationDirectory.users;
      state=clearOperationalState();state.station={...state.station,id:activeStationId};
      addAudit('Station records cleared',state.station.name,`${before} prior records`,'Empty operational workspace','Manager cleared records for this station only; its tank/pump setup, shared Supervisor accounts and assignments were retained.');
      state.users=users;saveState();modal=null;activePage='data';render();notify('Station records cleared',`Operational records for ${state.station.name} are cleared; other station data and all assignments are retained.`);
    }
    function addDiscrepancy(data) {
      const duplicate = state.discrepancies.find(d => d.status === 'Open' && d.type === data.type && d.businessDate === data.businessDate && (d.tankId || d.recordId) === (data.tankId || data.recordId));
      if (duplicate) return duplicate;
      const issue = { id: makeId('DSP'), status: 'Open', createdBy: currentUser ? currentUser.name : 'System', createdAt: new Date().toISOString(), ...data };
      state.discrepancies.unshift(issue);
      return issue;
    }
    function notify(title, detail = '', isError = false) {
      if (!isError && lastSubmitKey) dropDraftKey = lastSubmitKey; // a successful submit starts the form fresh
      lastSubmitKey = '';
      if (isError && modal && document.querySelector('.modal form')) modal.error = { title, detail };
      toast = { title, detail, isError, shownAt: Date.now() };animFlags.toast=true;
      queueRender();
      dropDraftKey = '';
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast = null; queueRender(); }, isError ? 8000 : 4200);
    }
    async function refreshAutosaveVersions(){
      try{autosaveVersions=await listSnapshots();}catch(error){autosaveVersions=[];autosaveWarning(`Recovery points could not be listed: ${error.message||error}`,true);}
      return autosaveVersions;
    }
    async function openAutosaveVersionManager(){
      if(!isManager())return notify('Permission denied','Only the authorized Manager can restore a recovery point.',true);
      if(!autosaveRuntime.indexedDB)return notify('Local database unavailable','Recovery points need IndexedDB. Use a downloaded full backup instead.',true);
      await refreshAutosaveVersions();openModal('auto-backups');
    }
    function retryAutosavePersistence(){
      if(!stationDirectory)return notify('Workspace unavailable','No station workspace is loaded to save.',true);
      if(!autosaveRuntime.indexedDB)return notify('Local database unavailable','This browser context does not allow IndexedDB. Download a full backup to keep these records.',true);
      persistDirectorySnapshot({action:'Manual save retry',force:true});
      saveChain.then(()=>{if(saveStatus.kind==='saved')notify('Saved','All records are stored in the local database.');});
    }
    async function createManualRecoveryPoint(){
      if(!isManager())return notify('Permission denied','Only the Manager can create recovery points.',true);
      if(!autosaveRuntime.indexedDB)return notify('Local database unavailable','Recovery points need IndexedDB.',true);
      try{await saveChain;const id=await createSnapshot('Manual recovery point',{force:true});await refreshAutosaveVersions();render();notify('Recovery point created',`${id} was verified and stored in this browser. Download a full backup to protect against device loss.`);}
      catch(error){notify('Recovery point failed',String(error&&error.message||error),true);}
    }
    function automaticBackupsMarkup(){
      if(!autosaveVersions.length)return `<div class="modal-body"><div class="table-empty">No recovery points are stored yet. One is created automatically every ${esc(storageSettings.intervalMinutes)} minutes of activity, before every restore or import, and on demand.</div></div><div class="modal-footer"><button type="button" class="btn btn-outline" data-action="close-modal">Close</button></div>`;
      const rows=autosaveVersions.map((version,index)=>{
        const isLatest=index===0&&version.revision===committed.revision;
        return `<article class="autosave-version-card"><div class="autosave-version-copy"><strong>Revision ${esc(version.revision)} ${isLatest?badge('Matches current','green'):''} ${version.pinned?badge('Safety point','blue'):''}</strong><span>${esc(dateTime(version.createdAt))} · ${esc(version.reason||'Recovery point')}</span><small>${version.stationCount} station${version.stationCount===1?'':'s'} · ${num(version.recordCount,0)} records · ${version.userCount} Supervisor account${version.userCount===1?'':'s'} · ${formatBytes(version.size)} · ${esc(version.algorithm)} <span class="mono">${esc(String(version.checksum).slice(0,12))}…</span></small></div><button type="button" class="btn btn-small ${isLatest?'btn-outline':'btn-primary'}" data-action="select-auto-backup" data-backup-id="${esc(version.id)}" ${isLatest?'disabled':''}>${isLatest?'Current':'Restore'}</button></article>`;
      }).join('');
      return `<div class="modal-body autosave-version-list"><div class="callout"><span>${icon('shield',15)}</span><span>Recovery points are stored in this browser's IndexedDB and checked against their SHA-256 checksum before restore. Restoring first saves the current state as a safety point, so you can undo a restore. These copies live on this device only.</span></div>${rows}</div><div class="modal-footer"><button type="button" class="btn btn-outline" data-action="close-modal">Close</button></div>`;
    }
    function automaticBackupRestoreConfirmMarkup(id){
      const version=autosaveVersions.find(item=>item.id===String(id));if(!version)return `<div class="modal-body">That recovery point is no longer available. Reopen the list and try again.</div>`;
      return `<form id="automatic-backup-restore-form" data-backup-id="${esc(version.id)}"><div class="modal-body"><div class="callout form-warning">${icon('alert',15)}<span><strong>Restore revision ${esc(version.revision)} from ${esc(dateTime(version.createdAt))}?</strong><br>This replaces every station workspace, record and Supervisor account with the selected recovery point. The current state is first saved as a safety point.</span></div><label class="check-row"><input type="checkbox" name="confirm" required><span><strong>I understand this restores the full workspace</strong><span>Every station and shared account returns to this point in time.</span></span></label></div>${modalFooter('Cancel','Verify and restore','danger')}</form>`;
    }
    function fullBackupConfirmMarkup(m){
      const p=m.parsed||{},counts=p.counts||{},sites=(p.data&&p.data.stations)||[];
      const siteRows=sites.map(site=>`<li><strong>${esc(site.name||site.id)}</strong> · ${num(stationRecordCount(site.data||{}),0)} records</li>`).join('');
      return `<form id="full-backup-import-form"><div class="modal-body"><dl class="kv-list"><div><dt>File</dt><dd>${esc(m.fileName)}</dd></div><div><dt>Exported</dt><dd>${esc(p.exportedAt?dateTime(p.exportedAt):'—')} by ${esc(p.exportedBy||'—')}</dd></div><div><dt>Database revision</dt><dd>${esc(p.databaseRevision)}</dd></div><div><dt>Contents</dt><dd>${num(counts.stations||sites.length,0)} stations · ${num(counts.records||0,0)} records · ${num(counts.users||0,0)} Supervisor accounts</dd></div><div><dt>Integrity</dt><dd>${badge('SHA-256 verified','green')} <span class="mono">${esc(String(m.checksum).slice(0,16))}…</span></dd></div></dl><ul class="plain-list">${siteRows}</ul><div class="callout form-warning">${icon('alert',15)}<span>This replaces <strong>every</strong> station, record, Supervisor account and recovery setting in this browser. The current state is saved first as a safety recovery point.</span></div><label class="check-row"><input type="checkbox" name="confirm" required><span><strong>Replace the full workspace with this backup</strong><span>You can undo by restoring the safety recovery point.</span></span></label></div>${modalFooter('Cancel','Restore full backup','danger')}</form>`;
    }
    async function restoreAutomaticBackup(form){
      if(!isManager())return notify('Permission denied','Only the authorized Manager can restore recovery points.',true);
      if(new FormData(form).get('confirm')!=='on')return notify('Confirmation required','Confirm that the full workspace should be restored.',true);
      const id=String(form.dataset.backupId||'');
      try{
        await saveChain;const verified=await loadVerifiedSnapshot(id),beforeCount=stationDirectory.stations.reduce((sum,site)=>sum+stationRecordCount(site.data||{}),0);
        await restoreDirectory(verified.payload,'Recovery point restored',[`${beforeCount} records before restore`,`Revision ${verified.row.revision} · ${verified.row.reason}`,'Manager restored a checksum-verified local recovery point; the prior state was saved as a safety point.']);
        autosaveRuntime.restoreSource=`recovery point revision ${verified.row.revision}`;
        notify('Recovery point restored',`Revision ${verified.row.revision} from ${dateTime(verified.row.createdAt)} is active. The previous state was kept as a safety point.`);
      }catch(error){notify('Restore failed',`${error.message||error} Current records were not changed.`,true);}
    }
    async function saveRetentionSettings(form){
      if(!isManager())return notify('Permission denied','Only the Manager can change recovery settings.',true);
      const fd=new FormData(form),retention=Number(fd.get('retention')),intervalMinutes=Number(fd.get('interval'));
      if(!RETENTION_CHOICES.includes(retention)||!INTERVAL_CHOICES.includes(intervalMinutes))return notify('Invalid setting','Choose one of the listed retention and interval options.',true);
      try{await saveStorageSettings({retention,intervalMinutes});await refreshAutosaveVersions();render();notify('Recovery settings saved',`Keeping the latest ${retention} recovery points; automatic point every ${intervalMinutes} minutes while records change.`);}
      catch(error){notify('Settings not saved',String(error&&error.message||error),true);}
    }
    function formatBytes(bytes){const value=Number(bytes)||0;if(value<1024)return `${value} B`;if(value<1048576)return `${(value/1024).toFixed(1)} KB`;if(value<1073741824)return `${(value/1048576).toFixed(1)} MB`;return `${(value/1073741824).toFixed(2)} GB`;}
    async function importFullBackup(form){
      if(!isManager())return notify('Permission denied','Only the Manager can restore a full backup.',true);
      if(!modal||modal.type!=='full-backup-confirm'||!modal.parsed)return notify('Backup confirmation expired','Choose the backup file again.',true);
      if(new FormData(form).get('confirm')!=='on')return notify('Confirmation required','Confirm that the full workspace should be replaced.',true);
      const parsed=modal.parsed,fileName=modal.fileName;
      try{
        const check=await validateFullBackup(parsed);if(!check.ok)return notify('Backup rejected',check.error,true);
        await saveChain;const beforeCount=stationDirectory.stations.reduce((sum,site)=>sum+stationRecordCount(site.data||{}),0);
        const normalized=cloneJson(parsed.data);
        // Older backups carry no Manager account: keep the current one so the workspace stays accessible.
        if(!normalized.manager&&stationDirectory.manager)normalized.manager=cloneJson(stationDirectory.manager);
        if(!normalized.organization&&stationDirectory.organization)normalized.organization=cloneJson(stationDirectory.organization);
        if(parsed.settings){const retention=Number(parsed.settings.retention),intervalMinutes=Number(parsed.settings.intervalMinutes);await saveStorageSettings({retention:RETENTION_CHOICES.includes(retention)?retention:storageSettings.retention,intervalMinutes:INTERVAL_CHOICES.includes(intervalMinutes)?intervalMinutes:storageSettings.intervalMinutes});}
        await restoreDirectory(normalized,'Full backup imported',[`${beforeCount} records before import`,`${fileName} · exported ${parsed.exportedAt} by ${parsed.exportedBy}`,`Checksum ${check.checksum.slice(0,16)}… verified; the prior state was saved as a safety point.`]);
        notify('Full backup restored',`${parsed.counts&&parsed.counts.records||0} records across ${parsed.counts&&parsed.counts.stations||0} stations were restored. The previous state was kept as a safety point.`);
      }catch(error){notify('Import failed',`${error.message||error} Current records were not changed.`,true);}
    }
    function storageStatusMarkup(){
      const ratio=autosaveRuntime.quota?autosaveRuntime.usage/autosaveRuntime.quota:0,pct=Math.round(ratio*100);
      const rows=[
        ['Database',autosaveRuntime.indexedDB?'IndexedDB · this browser on this device':'Unavailable — records are not being saved'],
        ['Last saved',autosaveRuntime.lastSavedAt?`${dateTime(autosaveRuntime.lastSavedAt)} · revision ${autosaveRuntime.revision}`:'Not yet saved'],
        ['Latest recovery point',autosaveRuntime.lastSnapshotAt?dateTime(autosaveRuntime.lastSnapshotAt):'None yet'],
        ['Persistent storage',autosaveRuntime.storagePersistent?'Granted — the browser will not evict data automatically':'Not granted — the browser may clear data under storage pressure'],
        ['Storage used',autosaveRuntime.quota?`${formatBytes(autosaveRuntime.usage)} of ${formatBytes(autosaveRuntime.quota)} (${pct}%)`:'Estimate unavailable']
      ];
      return `<div class="modal-body"><div class="save-detail is-${esc(saveStatus.kind)}">${icon(saveStatus.kind==='error'||saveStatus.kind==='unavailable'?'alert':'checkcircle',18)}<span>${esc(saveStatus.text)}</span></div><dl class="kv-list">${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${autosaveRuntime.quota?`<div class="storage-meter" role="img" aria-label="Storage ${pct}% used"><span class="width-${Math.min(100,Math.max(0,pct))}"></span></div>`:''}<div class="callout">${icon('info',15)}<span>Records are saved immediately after each change and stay on this device only. Clearing browser data, private windows or a lost device will remove them. ${isManager()?'Download a full backup regularly and store it off this device.':'Ask the Manager to download a full backup regularly.'}</span></div></div><div class="modal-footer">${saveStatus.kind==='error'?'<button type="button" class="btn btn-outline" data-action="retry-autosave">Retry save</button>':''}${isManager()?`<button type="button" class="btn btn-outline" data-action="go-data">Data management</button><button type="button" class="btn btn-primary" data-action="export-full-backup">${icon('download',15)} Full backup</button>`:'<button type="button" class="btn btn-primary" data-action="close-modal">Close</button>'}</div>`;
    }
    function setPage(page,options={}) {
      if (!PAGE_META[page] || !currentUser) return;
      const allowed = NAV[currentUser.role].some(item => item[0] === page);
      if (!allowed) return;
      const changed=activePage!==page;
      if(changed)auditLimit=AUDIT_PAGE;
      const finish=()=>{
        window.scrollTo({ top: 0, behavior:'auto' });
        if(changed){const heading=document.querySelector('.page-content h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}}
      };
      const content=document.querySelector('.page-content');
      const crossfade=changed&&content&&!prefersReducedMotion()&&!pageExitTimer;
      activePage = page;
      modal = null;notificationsOpen=false;
      if(drawerOpen)drawerOpen=false;
      if(!options.fromHistory)writeRoute(page);
      animFlags.page=changed;
      if(crossfade){
        window.scrollTo({top:0,behavior:'auto'});
        content.classList.add('page-exiting');
        pageExitTimer=setTimeout(()=>{pageExitTimer=null;render();finish();},175);
      }else{
        if(pageExitTimer){clearTimeout(pageExitTimer);pageExitTimer=null;}
        render();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion()?'auto':'smooth' });
        if(changed){const heading=document.querySelector('.page-content h1');if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}}
      }
    }
    function isSupervisor() { return currentUser && currentUser.role === 'supervisor'; }
    function isManager() { return currentUser && currentUser.role === 'manager'; }
    function nozzlesForTank(tankId) { return state.nozzles.filter(n => n.tankId === tankId); }
    function nozzleById(id) { return state.nozzles.find(n => n.id === id); }
    function tankById(id) { return state.tanks.find(t => t.id === id); }
    function configuredTankTolerance(tank){
      const specific=tank&&tank.tolerance;
      if(specific!==undefined&&specific!==null&&Number.isFinite(Number(specific))&&Number(specific)>=0)return Number(specific);
      const stationValue=state.station&&state.station.varianceTolerance;
      return stationValue!==undefined&&stationValue!==null&&Number.isFinite(Number(stationValue))&&Number(stationValue)>=0?Number(stationValue):200;
    }
    function currentFuelPrice(fuelType) { const globalPrice=Number(stationDirectory&&stationDirectory.priceLevels&&stationDirectory.priceLevels[fuelType]);if(Number.isFinite(globalPrice)&&globalPrice>0)return globalPrice;const n=state.nozzles.find(nozzle=>nozzle.active&&nozzle.fuel===fuelType)||state.nozzles.find(nozzle=>nozzle.fuel===fuelType);return n?Number(n.price||0):0; }
    function pendingPriceRequests() { return state.priceRequests.filter(request=>request.status==='pending'); }
    function latestPriceChange(fuelType) { return state.priceHistory.filter(entry=>entry.fuelType===fuelType).sort((a,b)=>new Date(b.effectiveAt||b.createdAt||0)-new Date(a.effectiveAt||a.createdAt||0))[0]||null; }
    function readingsForDate(date) { return state.readings.filter(r => r.businessDate === date); }
    function sortRecords(rows) { return rows.slice().sort((a, b) => new Date(b.createdAt || b.at || 0) - new Date(a.createdAt || a.at || 0)); }
    function dailyMetrics(date) {
      const rows = readingsForDate(date);
      const result = { litres: 0, sales: 0, petrolLitres: 0, dieselLitres: 0, petrolSales: 0, dieselSales: 0, payments: payObject(), readings: rows };
      rows.forEach(r => {
        result.litres += Number(r.litres || 0);
        result.sales += Number(r.salesValue || 0);
        const fuelKey = r.fuelType === 'Petrol' ? 'petrol' : 'diesel';
        result[`${fuelKey}Litres`] += Number(r.litres || 0);
        result[`${fuelKey}Sales`] += Number(r.salesValue || 0);
        PAYMENT_KEYS.forEach(k => result.payments[k] += Number((r.payments || {})[k] || 0));
      });
      result.litres = Number(result.litres.toFixed(1));
      result.sales = Number(result.sales.toFixed(2));
      result.collectionTotal = sumPayments(result.payments);
      result.collectionDifference = Number((result.sales - result.collectionTotal).toFixed(2));
      result.bankDue = result.sales;
      result.depositLitres = result.litres;
      return result;
    }
    /* ---------- Manager organization aggregation ----------
       These helpers mirror dailyMetrics/tank math but read a station directory entry's own data, so the
       Manager dashboard can aggregate across every managed station without switching (or distorting)
       the active station context. They never touch `state` — pure data-in, metrics-out. */
    function stationDayMetrics(data, date) {
      const rows = (Array.isArray(data && data.readings) ? data.readings : []).filter(r => r.businessDate === date);
      const result = { litres: 0, sales: 0, petrolLitres: 0, dieselLitres: 0, petrolSales: 0, dieselSales: 0, payments: payObject(), readings: rows };
      rows.forEach(r => {
        result.litres += Number(r.litres || 0);
        result.sales += Number(r.salesValue || 0);
        const fuelKey = r.fuelType === 'Petrol' ? 'petrol' : 'diesel';
        result[`${fuelKey}Litres`] += Number(r.litres || 0);
        result[`${fuelKey}Sales`] += Number(r.salesValue || 0);
        PAYMENT_KEYS.forEach(k => result.payments[k] += Number((r.payments || {})[k] || 0));
      });
      result.litres = Number(result.litres.toFixed(1));
      result.sales = Number(result.sales.toFixed(2));
      result.collectionTotal = sumPayments(result.payments);
      result.collectionDifference = Number((result.sales - result.collectionTotal).toFixed(2));
      return result;
    }
    function stationStockSnapshot(data) {
      const tanks = Array.isArray(data && data.tanks) ? data.tanks : [];
      const rows = tanks.map(tank => {
        const physical = Math.max(0, Number(tank.physicalStock || 0));
        const restricted = Math.max(0, Number(tank.restrictedLitres || 0));
        const capacity = Math.max(1, Number(tank.capacity || 0));
        const available = Math.max(0, Number((physical - restricted).toFixed(1)));
        return { id: tank.id, fuel: tank.fuel === 'Petrol' ? 'Petrol' : 'Diesel', physical, available, capacity, pct: Math.max(0, Math.min(100, physical / capacity * 100)), cost: physical * Number(tank.purchaseCostPerLitre || 0) };
      });
      const total = rows.reduce((acc, row) => ({ physical: acc.physical + row.physical, available: acc.available + row.available, capacity: acc.capacity + row.capacity, cost: acc.cost + row.cost }), { physical: 0, available: 0, capacity: 0, cost: 0 });
      total.pct = total.capacity ? Math.max(0, Math.min(100, total.physical / total.capacity * 100)) : 0;
      return { rows, total };
    }
    function stationPendingSummary(data) {
      const d = data || {};
      const deposits = Array.isArray(d.deposits) ? d.deposits.filter(r => r.workflow === DEPOSIT_WORKFLOW && r.status === 'Pending manager approval').length : 0;
      const deliveries = Array.isArray(d.deliveries) ? d.deliveries.filter(r => r.status === 'pending').length : 0;
      const priceRequests = Array.isArray(d.priceRequests) ? d.priceRequests.filter(r => r.status === 'pending').length : 0;
      const meterRequests = Array.isArray(d.meterRequests) ? d.meterRequests.filter(r => r.status === 'pending').length : 0;
      const openDiscrepancies = Array.isArray(d.discrepancies) ? d.discrepancies.filter(r => r.status === 'Open').length : 0;
      const total = deposits + deliveries + priceRequests + meterRequests + openDiscrepancies;
      return { deposits, deliveries, priceRequests, meterRequests, openDiscrepancies, total };
    }
    // Account structure: the Manager is the REGIONAL Business Manager — every station in this
    // stationDirectory IS their region. The Manager account itself is never a station and holds no
    // operational data of its own; supervisors own day-to-day operations at their assigned stations.
    // One row of oversight facts per managed station, computed from that station's own saved data.
    function managerAggregateRows(date) {
      const stations = stationDirectory && Array.isArray(stationDirectory.stations) ? stationDirectory.stations : [];
      return stations.map(entry => {
        const data = entry.data || {};
        const day = stationDayMetrics(data, date);
        const stock = stationStockSnapshot(data);
        const pending = stationPendingSummary(data);
        return {
          id: entry.id,
          name: data.station && data.station.name || entry.name || entry.id,
          location: data.station && data.station.location || entry.location || '',
          day, stock, pending,
          pumps: (Array.isArray(data.dispensers) ? data.dispensers.filter(d => d.active).length : 0),
          nozzles: (Array.isArray(data.nozzles) ? data.nozzles.filter(n => n.active).length : 0),
          isActive: String(entry.id) === String(activeStationId)
        };
      });
    }
    function managerAggregateTotals(rows) {
      const totals = rows.reduce((acc, row) => ({
        litres: acc.litres + row.day.litres,
        sales: acc.sales + row.day.sales,
        collection: acc.collection + row.day.collectionTotal,
        physical: acc.physical + row.stock.total.physical,
        capacity: acc.capacity + row.stock.total.capacity,
        stockCost: acc.stockCost + row.stock.total.cost,
        pending: acc.pending + row.pending.total,
        readings: acc.readings + row.day.readings.length
      }), { litres: 0, sales: 0, collection: 0, physical: 0, capacity: 0, stockCost: 0, pending: 0, readings: 0 });
      totals.difference = Number((totals.sales - totals.collection).toFixed(2));
      totals.stockPct = totals.capacity ? Math.max(0, Math.min(100, totals.physical / totals.capacity * 100)) : 0;
      totals.reporting = rows.filter(row => row.day.readings.length > 0).length;
      return totals;
    }
    function deliveryQuantityForTank(tankId, date) {
      return state.deliveries.filter(d => d.businessDate === date && d.tankId === tankId && d.stockApplied && ['approved_awaiting_receipt','received'].includes(d.status)).reduce((sum, d) => sum + Number(d.approvedQty ?? d.actualQty ?? 0), 0);
    }
    function salesForTank(tankId, date) {
      return readingsForDate(date).filter(r => r.tankId === tankId).reduce((sum, r) => sum + Number(r.litres || 0), 0);
    }
    function adjustmentsForTank(tankId, date) {
      return state.adjustments.filter(a => a.tankId === tankId && a.businessDate === date && a.status === 'Authorized').reduce((sum, a) => sum + Number(a.litres || 0), 0);
    }
    function tankMetrics(tank, date = TODAY) {
      const deliveries = deliveryQuantityForTank(tank.id, date);
      const litresSold = salesForTank(tank.id, date);
      const adjustments = adjustmentsForTank(tank.id, date);
      const dayReadings=state.stockReadings.filter(r=>r.tankId===tank.id&&r.businessDate===date);
      const openingReading=sortRecords(dayReadings.filter(r=>r.measurementType==='Opening stock'))[0];
      const opening=openingReading?Number(openingReading.physical):Number(tank.openingStock||0);
      const expected = Number((opening + deliveries - litresSold + adjustments).toFixed(1));
      const stockReading = sortRecords(dayReadings.filter(r=>r.measurementType!=='Opening stock'))[0];
      const physical = stockReading ? Number(stockReading.physical) : Number(tank.physicalStock || 0);
      const variance = Number((physical - expected).toFixed(1));
      const restricted = Math.max(0, Number(tank.restrictedLitres || 0));
      const available = Math.max(0, Number((physical - restricted).toFixed(1)));
      const inventoryCostValue = Number((physical * Number(tank.purchaseCostPerLitre || 0)).toFixed(2));
      return { tank, opening, deliveries, litresSold, adjustments, expected, physical, variance, restricted, available, inventoryCostValue, tolerance: configuredTankTolerance(tank), pct: Math.max(0, Math.min(100, tank.capacity ? physical / tank.capacity * 100 : 0)) };
    }
    function amountBanked(date) {
      return state.deposits.filter(d=>d.businessDate===date&&d.workflow===DEPOSIT_WORKFLOW&&d.status==='Approved').reduce((sum,d)=>sum+Number(d.amount||0),0);
    }
    function pendingDepositApprovals() { return state.deposits.filter(d=>d.workflow===DEPOSIT_WORKFLOW&&d.status==='Pending manager approval'); }
    function depositCloseAt(date) { return new Date(`${date}T${String(BUSINESS_CLOSE_HOUR).padStart(2,'0')}:00:00`); }
    function depositDeadlineAt(date) { return new Date(`${shiftDate(date,1)}T${String(BANK_DEADLINE_HOUR).padStart(2,'0')}:00:00`); }
    function depositStatus(date, now=new Date()) {
      const due=dailyMetrics(date).sales;
      const dateDeposits=state.deposits.filter(d=>d.businessDate===date&&d.workflow===DEPOSIT_WORKFLOW);
      const approved=dateDeposits.filter(d=>d.status==='Approved');
      const pending=dateDeposits.filter(d=>d.status==='Pending manager approval');
      const rejected=dateDeposits.filter(d=>d.status==='Rejected');
      const banked=Number(approved.reduce((sum,d)=>sum+Number(d.amount||0),0).toFixed(2));
      const pendingAmount=Number(pending.reduce((sum,d)=>sum+Number(d.amount||0),0).toFixed(2));
      const submitted=Number((banked+pendingAmount).toFixed(2));
      const outstanding=Number(Math.max(0,due-banked).toFixed(2));
      const notSubmitted=Number(Math.max(0,due-submitted).toFixed(2));
      const closed=now.getTime()>=depositCloseAt(date).getTime();
      const deadlineAt=depositDeadlineAt(date), deadlineDate=shiftDate(date,1);
      // Staged banking: several deposits may cover one business date. outstanding = due − approved; notSubmitted (still to bank) = due − approved − pending.
      let status,tone;const onTime=now.getTime()<=deadlineAt.getTime();
      if(due<=0){status='No sales to bank';tone='gray';}
      else if(banked-due>0.01){status='Approved amount exceeds sales · review';tone='red';}
      else if(due-banked<=0.01){status='Approved · fully reconciled';tone='green';}
      else if(due-submitted<=0.01){status='Awaiting manager approval';tone='blue';}
      else if(!closed){status='Closes at 9:00 pm';tone='gray';}
      else if(submitted>0.005){status=onTime?'Partially banked · bank by 10:00 am':'Partially banked · overdue';tone=onTime?'amber':'red';}
      else if(rejected.length){status='Rejected · resubmission needed';tone='red';}
      else if(onTime){status='Bank by 10:00 am';tone='amber';}
      else{status='Overdue';tone='red';}
      return {due,banked,pendingAmount,submitted,outstanding,notSubmitted,toBank:notSubmitted,status,tone,closed,deadlineDate,deadlineAt,depositCount:dateDeposits.length,approvedCount:approved.length,pendingCount:pending.length,hasPending:pending.length>0,hasApproved:approved.length>0,hasRejected:rejected.length>0,fullyBanked:due>0&&due-banked<=0.01};
    }
    function activeDepositBusinessDate(now=new Date()) {
      const today=localDateIso(now);
      return now.getTime()>=depositCloseAt(today).getTime()?today:shiftDate(today,-1);
    }
    function depositReminderTasks(now=new Date()) {
      const today=localDateIso(now);
      const dates=[...new Set(state.readings.map(reading=>reading.businessDate).filter(Boolean))].filter(date=>date<=today&&now.getTime()>=depositCloseAt(date).getTime()).sort().reverse();
      return dates.map(businessDate=>({businessDate,metrics:dailyMetrics(businessDate),summary:depositStatus(businessDate,now)})).filter(task=>task.metrics.sales>0&&['Bank by 10:00 am','Overdue','Rejected · resubmission needed','Partially banked · bank by 10:00 am','Partially banked · overdue'].includes(task.summary.status));
    }
    function pendingDeliveries() { return state.deliveries.filter(d => d.status === 'pending'); }
    function awaitingReceipt() { return state.deliveries.filter(d => d.status === 'approved_awaiting_receipt'); }
    function openDiscrepancies() { return state.discrepancies.filter(d => d.status === 'Open'); }
    function pendingMeterRequests() { return state.meterRequests.filter(r => r.status === 'pending'); }
    function roleCanSee(page) { return currentUser && NAV[currentUser.role].some(n => n[0] === page); }
    function statusTone(status) {
      const s = String(status || '').toLowerCase();
      if (s.includes('reject') || s.includes('open') || s.includes('variance') || s.includes('issue')) return 'red';
      if (s.includes('pending') || s.includes('awaiting') || s.includes('partial') || s.includes('scheduled')) return 'amber';
      if (s.includes('approv') || s.includes('verified') || s.includes('received') || s.includes('resolved') || s.includes('reconciled') || s.includes('operational')) return 'green';
      if (s.includes('review')) return 'blue';
      return 'gray';
    }
    function badge(status, tone) { return `<span class="badge ${tone || statusTone(status)}">${esc(status)}</span>`; }
    function currentPageMeta() {
      if (activePage === 'dashboard' && isManager()) {
        return managerHomeMode === 'aggregate'
          ? { title: 'Organization overview', eyebrow: 'REGIONAL OVERSIGHT', description: 'Live aggregate across every station in your region — open a station card for its full operational detail.' }
          : { title: 'Station drill-down', eyebrow: 'REGIONAL OVERSIGHT', description: `One station in its full operational context — figures belong to ${state.station.name || 'the selected station'} only.` };
      }
      return PAGE_META[activePage] || PAGE_META.dashboard;
    }
    function brandMarkup(light = false) {
      const org=stationDirectory&&stationDirectory.organization,tagline=org&&org.name?(String(org.tagline||'').trim()||'Station operations'):'Fuel station management';
      return `<div class="brand-lockup"><span class="brand-word" title="${esc(orgName())}">${esc(orgName())}</span><span class="brand-tagline">${esc(tagline)}</span></div>`;
    }

    function loginArtMarkup(){
      const site=stationDirectory&&stationDirectory.stations&&stationDirectory.stations[0],place=site&&site.location?`${esc(site.location)} · GHS`:'All amounts in GHS';
      return `<section class="login-art" aria-label="${esc(orgName())} station operations overview">
          <div class="login-brand">${brandMarkup(true)}</div>
          <div class="login-story">
            <div class="eyebrow">${esc(orgName())}</div>
            <h1>Good operations.<br>Down to the last drop.</h1>
            <p>One accountable workspace for tank stock, approved deliveries, pump readings, sales reconciliation and full-sales banking.</p>
            <figure class="login-art-visual">
              <img class="login-operations-photo" src="assets/images/energy-facility.webp" alt="Modern fuel storage and distribution facility at blue hour">
              <figcaption class="fuel-visual-caption">Energy infrastructure · operational control</figcaption>
              <div class="visual-stat"><strong>Operations, in focus</strong><span>Stock · sales · reconciliation · approvals</span></div>
            </figure>
          </div>
          <div class="login-art-foot"><span>Designed for accountable station operations</span><span>${place}</span></div>
        </section>`;
    }
    /* One combined sign-in: no role selector. The account directory determines whether the
       credentials belong to the authorized Manager or a station Supervisor, and the matching
       dashboard opens. */
    function renderLogin() {
      return `<main class="login-page">
        ${loginArtMarkup()}
        <section class="login-main">
          ${themeToggleMarkup('topbar-icon-btn login-theme-btn')}
          <div class="login-card">
            <div class="login-mobile-brand">${brandMarkup()}</div>
            <div class="eyebrow u-607ac117">SECURE WORKSPACE</div>
            <h2>Welcome back</h2>
            <p class="login-lead">Sign in with your Supabase Manager account. This integration stage verifies cloud identity; operational records are not yet shared between devices.</p>
            ${bootRestorePending?`<div class="callout u-6bfd29cf" role="status">${icon('refresh',15)}<span>Verifying saved workspace data and checking recovery backups…</span><span class="boot-progress" aria-hidden="true"></span></div>`:''}
            ${!bootRestorePending&&defaultManagerPending()?`<div class="callout login-default-credentials" role="note">${icon('shield',15)}<span><strong>First sign-in.</strong> The system auto-configured the authorized Manager account — username <strong>${esc(DEFAULT_MANAGER_USERNAME)}</strong>, password <strong>${esc(DEFAULT_MANAGER_PASSWORD)}</strong>. You must set your own password immediately after signing in; it cannot be recovered later.</span></div>`:''}
            <form id="login-form" autocomplete="on">
              <div class="field"><label for="login-username">Username</label><div class="input-wrap"><span class="leading">${icon('user', 16)}</span><input id="login-username" name="username" autocomplete="username" placeholder="Enter your username" required></div></div>
              <div class="field"><label for="login-password">Password</label><div class="input-wrap"><span class="leading">${icon('lock', 16)}</span><input id="login-password" name="password" autocomplete="current-password" type="password" placeholder="Enter your password" required></div></div>
              <div class="login-error" role="status">${esc(loginError)}</div>
              <button class="btn btn-primary btn-block" type="submit" ${bootRestorePending?'disabled':''}>${bootRestorePending?'Restoring saved data…':'Sign in'} ${icon('arrow',16)}</button>
            </form>
            <p class="login-help">${icon('info',14)}<span>Forgotten your password? Supervisors: ask your Manager to reset it. Records are saved on this device.</span></p>
            ${!bootRestorePending&&defaultManagerPending()&&!workspaceHasRecords()?`<details class="setup-restore"><summary>${icon('refresh',14)} Moving from another device? Restore a full backup instead</summary>
              <form id="setup-restore-form"><div class="field"><label for="setup-restore-file">Full backup file (.json)</label><input id="setup-restore-file" name="file" type="file" accept="application/json,.json" required></div><p class="field-hint">The file’s checksum is verified before anything is restored, replacing this auto-configured workspace. Sign in afterwards with the accounts saved in the backup.</p><button class="btn btn-outline" type="submit">Restore backup</button></form>
            </details>`:''}
          </div>
        </section>
      </main>`;
    }
    /* ---------- first-launch setup ---------- */
    let setupError='';
    function readSetupDraft(){const form=document.getElementById('setup-form');if(!form)return null;return [...form.elements].filter(el=>el.name&&el.type!=='file'&&el.type!=='submit').map(el=>[el.name,el.type==='checkbox'?el.checked:el.value]);}
    function restoreSetupDraft(draft){const form=document.getElementById('setup-form');if(!form||!draft)return;draft.forEach(([name,value])=>{const el=form.elements[name];if(!el||el.length)return;if(el.type==='checkbox')el.checked=value;else el.value=value;});}
    function setupField(id,label,attrs,hint=''){return `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${attrs}${hint?` aria-describedby="${id}-hint"`:''}>${hint?`<span class="field-hint" id="${id}-hint">${hint}</span>`:''}</div>`;}
    function renderSetup() {
      const existing=workspaceHasRecords();
      const stationPart=existing?'':`
            <fieldset class="setup-section"><legend><span class="setup-step">2</span> Station</legend>
              <div class="form-grid">
                ${setupField('setup-station','Station name *','name="stationName" required maxlength="70" placeholder="e.g. Spintex Road station" autocomplete="off"')}
                ${setupField('setup-location','Location *','name="stationLocation" required maxlength="100" placeholder="Town, area or address" autocomplete="off"')}
                ${setupField('setup-pumps','Number of pumps *','name="pumpCount" type="number" min="1" max="50" step="1" required inputmode="numeric" placeholder="e.g. 4"','Each pump has one Super/Petrol and one Diesel nozzle.')}
                ${setupField('setup-tolerance','Variance tolerance (L) *','name="tolerance" type="number" min="0" max="100000" step="1" required inputmode="numeric" placeholder="e.g. 50"','Dip differences above this are flagged for investigation.')}
              </div>
            </fieldset>
            <fieldset class="setup-section"><legend><span class="setup-step">3</span> Tanks and current stock</legend>
              <div class="setup-tank-grid">
                <div class="setup-tank super"><strong>Super / Petrol tank</strong>
                  ${setupField('setup-super-capacity','Capacity (L) *','name="superCapacity" type="number" min="1000" max="500000" step="1" required inputmode="numeric" placeholder="e.g. 30000"')}
                  ${setupField('setup-super-stock','Current stock from dip (L)','name="superStock" type="number" min="0" step="0.1" inputmode="decimal" placeholder="0"')}
                  ${setupField('setup-super-cost','Purchase cost (GHS per litre)','name="superCost" type="number" min="0" max="1000" step="0.01" inputmode="decimal" placeholder="0.00"')}
                </div>
                <div class="setup-tank diesel"><strong>Diesel tank</strong>
                  ${setupField('setup-diesel-capacity','Capacity (L) *','name="dieselCapacity" type="number" min="1000" max="500000" step="1" required inputmode="numeric" placeholder="e.g. 30000"')}
                  ${setupField('setup-diesel-stock','Current stock from dip (L)','name="dieselStock" type="number" min="0" step="0.1" inputmode="decimal" placeholder="0"')}
                  ${setupField('setup-diesel-cost','Purchase cost (GHS per litre)','name="dieselCost" type="number" min="0" max="1000" step="0.01" inputmode="decimal" placeholder="0.00"')}
                </div>
              </div>
              <p class="field-hint setup-note">Leave stock empty if the first dip will be recorded later. Purchase cost is used for stock value only, never for sales.</p>
            </fieldset>
            <fieldset class="setup-section"><legend><span class="setup-step">4</span> Pump prices</legend>
              <div class="form-grid">
                ${setupField('setup-petrol-price','Super / Petrol (GHS per litre) *','name="petrolPrice" type="number" min="0.01" max="1000" step="0.01" required inputmode="decimal" placeholder="0.00"')}
                ${setupField('setup-diesel-price','Diesel (GHS per litre) *','name="dieselPrice" type="number" min="0.01" max="1000" step="0.01" required inputmode="decimal" placeholder="0.00"')}
              </div>
            </fieldset>`;
      const accountStep=existing?2:5;
      return `<main class="login-page setup-page">
        ${loginArtMarkup()}
        <section class="login-main">
          ${themeToggleMarkup('topbar-icon-btn login-theme-btn')}
          <div class="login-card setup-card">
            <div class="login-mobile-brand">${brandMarkup()}</div>
            <div class="eyebrow u-607ac117">FIRST-TIME SETUP</div>
            <h2>${existing?'Create the Manager account':'Set up your station'}</h2>
            <p class="login-lead">${existing?'Station records were found on this device. Create the Manager account to secure them and continue.':'The Manager enters the organisation, station, tanks, prices and their own sign-in. Everything can be changed later under Stations & pumps.'}</p>
            <form id="setup-form" autocomplete="off" novalidate>
            <fieldset class="setup-section"><legend><span class="setup-step">1</span> Organisation</legend>
              ${setupField('setup-org','Organisation name *','name="orgName" required maxlength="80" placeholder="Company name shown in the workspace" autocomplete="organization"')}
            </fieldset>
            ${stationPart}
            <fieldset class="setup-section"><legend><span class="setup-step">${accountStep}</span> Manager account</legend>
              <div class="form-grid">
                <div class="field span-2"><label for="setup-manager-name">Full name *</label><input id="setup-manager-name" name="managerName" required maxlength="80" autocomplete="name" placeholder="As it should appear in the audit trail"></div>
                ${setupField('setup-manager-username','Username *','name="managerUsername" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._\\-]{3,30}" autocomplete="username" placeholder="e.g. firstname.lastname"','Letters, numbers, dots, underscores or hyphens.')}
                <div class="field"></div>
                ${setupField('setup-manager-password','Password *','name="managerPassword" type="password" required minlength="10" autocomplete="new-password" placeholder="10+ characters"',PASSWORD_RULE)}
                ${setupField('setup-manager-password2','Confirm password *','name="managerPassword2" type="password" required minlength="10" autocomplete="new-password" placeholder="Repeat the password"')}
              </div>
            </fieldset>
            <div class="login-error" role="alert">${esc(setupError)}</div>
            <button class="btn btn-primary btn-block" type="submit">${existing?'Create Manager account':'Complete setup'} ${icon('arrow',16)}</button>
            </form>
            ${existing?'':`<details class="setup-restore"><summary>${icon('refresh',14)} Moving from another device? Restore a full backup instead</summary>
              <form id="setup-restore-form"><div class="field"><label for="setup-restore-file">Full backup file (.json)</label><input id="setup-restore-file" name="file" type="file" accept="application/json,.json" required></div><p class="field-hint">The file’s checksum is verified before anything is restored. Sign in afterwards with the accounts saved in the backup.</p><button class="btn btn-outline" type="submit">Restore backup</button></form>
            </details>`}
            <p class="login-help">${icon('shield',14)}<span>Passwords are stored only as salted PBKDF2 hashes. Records are saved in this browser on this device: download a full backup regularly from Data management.</span></p>
          </div>
        </section>
      </main>`;
    }
    async function completeSetup(form){
      if(!needsSetup())return;
      const fd=new FormData(form),val=key=>String(fd.get(key)??'').trim(),numOr=(key,fallback=NaN)=>{const raw=val(key);return raw===''?fallback:Number(raw);};
      const fail=message=>{setupError=message;render();const target=document.querySelector('#setup-form .login-error');if(target)target.scrollIntoView({block:'center'});};
      const existing=workspaceHasRecords();
      const org=val('orgName'),managerName=val('managerName'),username=val('managerUsername').toLowerCase(),password=String(fd.get('managerPassword')||''),confirmPassword=String(fd.get('managerPassword2')||'');
      if(org.length<2)return fail('Enter the organisation name (at least 2 characters).');
      let config=null;
      if(!existing){
        config={name:val('stationName'),location:val('stationLocation'),pumps:numOr('pumpCount'),tolerance:numOr('tolerance'),superCapacity:numOr('superCapacity'),dieselCapacity:numOr('dieselCapacity'),superStock:numOr('superStock',0),dieselStock:numOr('dieselStock',0),superCost:numOr('superCost',0),dieselCost:numOr('dieselCost',0),petrolPrice:numOr('petrolPrice'),dieselPrice:numOr('dieselPrice')};
        if(config.name.length<2)return fail('Enter the station name (at least 2 characters).');
        if(config.location.length<2)return fail('Enter the station location.');
        if(!Number.isInteger(config.pumps)||config.pumps<1||config.pumps>50)return fail('Number of pumps must be a whole number from 1 to 50.');
        if(!Number.isFinite(config.tolerance)||config.tolerance<0||config.tolerance>100000)return fail('Variance tolerance must be from 0 to 100,000 L.');
        for(const [label,cap] of [['Super / Petrol',config.superCapacity],['Diesel',config.dieselCapacity]])if(!Number.isInteger(cap)||cap<1000||cap>500000)return fail(`${label} tank capacity must be a whole number from 1,000 to 500,000 L.`);
        if(!Number.isFinite(config.superStock)||config.superStock<0||config.superStock>config.superCapacity)return fail('Super / Petrol stock must be between 0 and the tank capacity.');
        if(!Number.isFinite(config.dieselStock)||config.dieselStock<0||config.dieselStock>config.dieselCapacity)return fail('Diesel stock must be between 0 and the tank capacity.');
        if(!Number.isFinite(config.superCost)||config.superCost<0||!Number.isFinite(config.dieselCost)||config.dieselCost<0)return fail('Purchase costs cannot be negative.');
        for(const [label,price] of [['Super / Petrol',config.petrolPrice],['Diesel',config.dieselPrice]])if(!Number.isFinite(price)||price<0.01||price>1000)return fail(`Enter the current ${label} pump price in GHS per litre.`);
      }
      if(managerName.length<2)return fail('Enter the Manager’s full name.');
      if(!/^[a-z0-9._-]{3,30}$/.test(username))return fail('Username: use 3–30 letters, numbers, dots, underscores or hyphens.');
      if((stationDirectory.users||[]).some(user=>String(user.username).toLowerCase()===username))return fail('That username is already used by a Supervisor account.');
      const problem=passwordProblem(password);if(problem)return fail(`Password: ${problem}`);
      if(password!==confirmPassword)return fail('The two passwords do not match.');
      setupError='';
      const submit=form.querySelector('button[type="submit"]');if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
      const now=new Date().toISOString();
      const manager={id:'USR-MANAGER',role:'manager',username,name:managerName,initials:initialsFor(managerName),createdAt:now,createdBy:'Initial setup',...await createPasswordRecord(password)};
      stationDirectory.organization={name:org,createdAt:now};
      stationDirectory.manager=manager;
      currentUser=sessionUser(manager);
      if(!existing){
        const id='ST-01',data=makeSeedState();
        data.station={...data.station,id,name:config.name,location:config.location,dispenserCount:config.pumps,varianceTolerance:config.tolerance};
        const superTank=data.tanks.find(tank=>tank.fuel==='Petrol'),dieselTank=data.tanks.find(tank=>tank.fuel==='Diesel');
        [[superTank,config.superCapacity,config.superStock,config.superCost],[dieselTank,config.dieselCapacity,config.dieselStock,config.dieselCost]].forEach(([tank,capacity,stock,cost])=>{
          tank.capacity=capacity;tank.tolerance=config.tolerance;tank.purchaseCostPerLitre=Number(cost.toFixed(2));
          tank.openingStock=Number(stock.toFixed(1));tank.physicalStock=Number(stock.toFixed(1));tank.dipAt=stock>0?now:null;tank.stationId=id;
          if(stock>0)data.stockReadings.push({id:makeId('DIP'),businessDate:TODAY,tankId:tank.id,measurementType:'Opening stock',physical:Number(stock.toFixed(1)),method:'Manual tank dip',remarks:'Opening balance entered by the Manager during system setup.',createdBy:managerName,createdAt:now});
        });
        ensureDispenserSetup(data,config.pumps);
        stationDirectory.priceLevels={Petrol:Number(config.petrolPrice.toFixed(2)),Diesel:Number(config.dieselPrice.toFixed(2))};
        data.users=[];stationDirectory.users=data.users;
        const entry={id,name:config.name,location:config.location,pumpCount:config.pumps,supervisorIds:[],data:stationDataOnly(stampStationContext(applyGlobalPriceLevels(data)))};
        stationDirectory.stations=[entry];activeStationId=id;stationDirectory.activeStationId=id;
        state=hydrateStationEntry(entry);
        addAudit('System set up',org,'No configuration',`${config.name} · ${config.location} · ${config.pumps} pumps · Super ${num(config.superCapacity,0)} L / Diesel ${num(config.dieselCapacity,0)} L · Super GHS ${config.petrolPrice.toFixed(2)}/L · Diesel GHS ${config.dieselPrice.toFixed(2)}/L`,`Initial configuration by ${managerName}. Manager username “${username}”; the password is stored only as a PBKDF2 hash.`);
      }else{
        addAudit('Manager account created',username,'No Manager account',`${managerName} · ${org}`,'Created on this device for existing station records; the password is stored only as a PBKDF2 hash.');
      }
      saveState();
      saveChain.then(()=>createSnapshot('Initial setup recovery point',{force:true,silent:true,pinned:true})).catch(()=>{});
      activePage=existing?'dashboard':'setup';animFlags.page=true;render();
      notify(existing?'Manager account created':'Setup complete',existing?`Signed in as ${managerName}.`:`${config.name} is ready. Next, create a Supervisor account for each person who records shifts.`);
    }
    async function restoreFromSetup(form){
      // Allowed on a fresh, auto-provisioned workspace (no records yet) — e.g. when moving devices.
      // Once real records exist, restores stay behind the Manager-only Data management controls.
      if(workspaceHasRecords())return notify('Restore not available','This workspace already holds records. Sign in as the Manager and use Data management to restore backups.',true);
      const file=form.elements.file&&form.elements.file.files[0];
      if(!file)return notify('Choose a backup file','Select the full backup (.json) exported from Data management.',true);
      try{
        const parsed=JSON.parse(await file.text()),check=await validateFullBackup(parsed);
        if(!check.ok)return notify('Backup rejected',check.error,true);
        await saveChain;
        await restoreDirectory(cloneJson(parsed.data),'Full backup restored before first use',['Auto-configured empty workspace',`${file.name} · exported ${parsed.exportedAt||'—'} by ${parsed.exportedBy||'—'}`,`Checksum ${check.checksum.slice(0,16)}… verified.`]);
        notify('Backup restored','Sign in with an account saved in the backup.');
      }catch(error){notify('Restore failed',`${error&&error.message||error} Nothing was changed.`,true);}
    }

    function navCount(page) {
      if (page === 'approvals') return isManager()?allStationReviewQueueCount():pendingDeliveries().length + pendingMeterRequests().length + pendingPriceRequests().length + pendingDepositApprovals().length;
      if (page === 'discrepancies') return openDiscrepancies().length;
      if (page === 'deliveries') return awaitingReceipt().length;
      if (page === 'deposits' && isSupervisor()) return depositReminderTasks(new Date()).length + state.deposits.filter(d=>d.workflow===DEPOSIT_WORKFLOW&&d.status==='Pending manager approval').length;
      return 0;
    }
    function stationsForUser(user=currentUser){
      const stations=stationDirectory&&Array.isArray(stationDirectory.stations)?stationDirectory.stations:[];
      if(!user)return [];
      if(user.role==='manager')return stations;
      const allowed=new Set(assignedStationIds(user));
      return stations.filter(entry=>allowed.has(entry.id));
    }
    function stationSwitcherMarkup(force=false){
      const stations=stationsForUser();
      if(stations.length<2&&!force)return '';
      return `<label class="station-switcher-wrap"><span class="sr-only">Switch station</span>${icon('fuel',15)}<select class="station-switcher" aria-label="Switch active station" data-change="station-context">${stations.map(entry=>`<option value="${esc(entry.id)}" ${entry.id===activeStationId?'selected':''}>${esc(entry.name)}</option>`).join('')}</select>${icon('down',13)}</label>`;
    }
    function stationTankSummary(entry){
      const tanks=entry&&entry.data&&Array.isArray(entry.data.tanks)?entry.data.tanks:[];
      const superTank=tanks.find(tank=>tank.fuel==='Petrol'),dieselTank=tanks.find(tank=>tank.fuel==='Diesel');
      const superPhysical=Number(superTank&&superTank.physicalStock||0),dieselPhysical=Number(dieselTank&&dieselTank.physicalStock||0);
      const superAvailable=Math.max(0,superPhysical-Number(superTank&&superTank.restrictedLitres||0)),dieselAvailable=Math.max(0,dieselPhysical-Number(dieselTank&&dieselTank.restrictedLitres||0));
      return `Super / Petrol: ${num(superPhysical,0)} L physical · ${num(superAvailable,0)} L available / ${num(superTank&&superTank.capacity||60000,0)} L · Diesel: ${num(dieselPhysical,0)} L physical · ${num(dieselAvailable,0)} L available / ${num(dieselTank&&dieselTank.capacity||45000,0)} L`;
    }
    function recordStationAudit(stationId,action,record,oldValue,newValue,reason){
      if(String(stationId)===activeStationId){addAudit(action,record,oldValue,newValue,reason);return;}
      const entry=stationEntryById(stationId);if(!entry)return;
      const data=entry.data||{};data.audit=Array.isArray(data.audit)?data.audit:[];
      data.audit.unshift({id:makeId('AUD'),at:new Date().toISOString(),user:currentUser?currentUser.name:'System',role:currentUser&&currentUser.role==='manager'?'Authorized Manager':'System',stationId:String(stationId),action,record,oldValue:oldValue||'—',newValue:newValue||'—',reason:reason||''});
      entry.data=data;
    }
    function applyGlobalPriceLevel(fuelType,newPrice,options={}){
      const fuel=['Petrol','Diesel'].includes(fuelType)?fuelType:fuelClass(fuelType),price=Number(newPrice);
      if(!stationDirectory||!['Petrol','Diesel'].includes(fuel)||!Number.isFinite(price)||price<=0)return false;
      const previousGlobal=Number(stationDirectory.priceLevels&&stationDirectory.priceLevels[fuel]||currentFuelPrice(fuel));
      if(Math.abs(previousGlobal-price)<0.005)return false;
      const at=options.at||new Date().toISOString(),actor=options.actor||currentUser&&currentUser.name||'Authorized Manager',reason=options.reason||'Manager updated the shared station rate.';
      stationDirectory.priceLevels={...normalizePriceLevels(stationDirectory.priceLevels,[]),[fuel]:Number(price.toFixed(2))};
      stationDirectory.stations.forEach(entry=>{
        const data=entry.id===activeStationId?state:cloneJson(entry.data||{});
        data.nozzles=Array.isArray(data.nozzles)?data.nozzles:[];data.priceHistory=Array.isArray(data.priceHistory)?data.priceHistory:[];data.priceRequests=Array.isArray(data.priceRequests)?data.priceRequests:[];data.audit=Array.isArray(data.audit)?data.audit:[];
        const oldSitePrice=Number(data.nozzles.find(nozzle=>nozzle.fuel===fuel&&Number(nozzle.price)>0)?.price||previousGlobal);
        data.nozzles.filter(nozzle=>nozzle.fuel===fuel).forEach(nozzle=>{nozzle.price=Number(price.toFixed(2));});
        if(Math.abs(oldSitePrice-price)>=0.005){
          data.priceHistory.unshift({id:makeId('PCH'),requestId:options.requestId||'',fuelType:fuel,oldPrice:oldSitePrice,newPrice:Number(price.toFixed(2)),effectiveAt:at,approvedBy:actor,requestedBy:options.requestedBy||actor,reason,comments:options.comments||'',status:'Approved',global:true,stationId:entry.id});
          data.audit.unshift({id:makeId('AUD'),at,user:actor,role:'Authorized Manager',stationId:entry.id,action:'Global selling price updated',record:fuel==='Petrol'?'Super / Petrol':'Diesel',oldValue:`${money(oldSitePrice)}/L`,newValue:`${money(price)}/L effective ${dateTime(at)}`,reason});
        }
        data.priceRequests.filter(request=>request.status==='pending'&&request.fuelType===fuel&&request.id!==options.requestId).forEach(request=>{
          request.status='Superseded';request.decision={decision:'superseded',approver:actor,at,comments:`A Manager-set global ${fuel} price took effect across all stations; submit a fresh request if needed.`};
          data.audit.unshift({id:makeId('AUD'),at,user:actor,role:'Authorized Manager',stationId:entry.id,action:'Price request superseded by global rate',record:request.id,oldValue:`${money(request.currentPrice)}/L`,newValue:`${money(price)}/L global rate`,reason:request.decision.comments});
        });
        if(entry.id===activeStationId)state=data;else entry.data=stationDataOnly(stampStationContext(data));
      });
      stationDirectory.schema=5;
      return true;
    }
    function switchActiveStation(id){
      const next=stationEntryById(id);
      if(!next)return notify('Station not found','Choose a station that is still in the station directory.',true);
      if(!currentUser)return;
      if(!isManager()&&!assignedStationIds(currentUser).includes(next.id))return notify('Station access denied','Your Supervisor account is not assigned to that station.',true);
      if(next.id===activeStationId)return;
      const previous=stationEntryById(activeStationId);
      saveState();
      activeStationId=next.id;stationDirectory.activeStationId=next.id;
      state=hydrateStationEntry(next);
      if(isSupervisor()){
        const user=state.users.find(account=>account.id===currentUser.id);
        if(user)user.lastStationId=next.id;
        currentUser={...currentUser,lastStationId:next.id};
      }
      activePage='dashboard';modal=null;managerTankFuel='Petrol';readingDate=TODAY;reportDate=TODAY;
      depositDateFilter=activeDepositBusinessDate(new Date());defaultDepositDate=depositDateFilter;
      lastDepositReminderSignature='';
      saveState();render();
      notify('Station switched',`${previous?previous.name+' → ':''}${next.name}. Station records and tank balances are kept separate.`);
    }

    /* =====================================================================
       OPERATIONS UI · price board, dispenser cards, banking alerts, charts
       ===================================================================== */
    const UI_PREFS_KEY='icon-energy-ui-prefs';
    const BANKING_LOOKBACK_DAYS=45;
    let uiPrefs={sidebarCollapsed:false,trendRange:7,trendView:'total'};
    try{const raw=JSON.parse(localStorage.getItem(UI_PREFS_KEY)||'{}');if(raw&&typeof raw==='object'){uiPrefs.sidebarCollapsed=Boolean(raw.sidebarCollapsed);if([7,14,30].includes(Number(raw.trendRange)))uiPrefs.trendRange=Number(raw.trendRange);if(raw.trendView==='fuel')uiPrefs.trendView='fuel';}}catch(e){/* preferences are optional */}
    function saveUiPrefs(){try{localStorage.setItem(UI_PREFS_KEY,JSON.stringify(uiPrefs));}catch(e){/* preference only */}}
    let drawerOpen=false,notificationsOpen=false;
    const animFlags={page:true,modal:false,popover:false,toast:false,charts:false};
    /* Crossfade between in-page states: apply the state change, exit-fade the mounted content, then
       re-render. Shared structure stays where it is (no full repaint until the swap), selections are
       kept in the state variables, and reduced-motion users or overlapping requests resolve to an
       immediate render — repetitive operational actions are never slowed down. */
    let pageExitTimer = null;
    function transitionPage(mutate) {
      if (typeof mutate === 'function') mutate();
      const content = document.querySelector('.page-content');
      if (!content || prefersReducedMotion() || pageExitTimer) { animFlags.page = true; render(); return; }
      content.classList.add('page-exiting');
      pageExitTimer = setTimeout(() => { pageExitTimer = null; animFlags.page = true; render(); }, 175);
    }
    let lastRenderedPrices=null;
    const prefersReducedMotion=()=>typeof window!=='undefined'&&window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---------- price board (Operations page, top-right) ---------- */
    function priceBoardMarkup(){
      const fuels=[['Petrol','Super','super'],['Diesel','Diesel','diesel']];
      const now={Petrol:currentFuelPrice('Petrol'),Diesel:currentFuelPrice('Diesel')};
      const changed=lastRenderedPrices&&(Math.abs(lastRenderedPrices.Petrol-now.Petrol)>0.004||Math.abs(lastRenderedPrices.Diesel-now.Diesel)>0.004);
      lastRenderedPrices=now;
      const latest=fuels.map(([fuel])=>latestPriceChange(fuel)).filter(Boolean).sort((a,b)=>new Date(b.effectiveAt||0)-new Date(a.effectiveAt||0))[0];
      const tiles=fuels.map(([fuel,label,cls])=>{
        const change=latestPriceChange(fuel),delta=change?Number(change.newPrice)-Number(change.oldPrice):0;
        const deltaMarkup=change&&Math.abs(delta)>=0.005?`<span class="price-delta ${delta>0?'up':'down'}" title="Changed from ${money(change.oldPrice)} on ${esc(dateTime(change.effectiveAt))}">${delta>0?'▲':'▼'} ${Math.abs(delta).toFixed(2)}</span>`:`<span class="price-delta flat">No recent change</span>`;
        return `<div class="price-tile ${cls}"><span class="price-fuel"><i class="fuel-dot ${cls}"></i>${label}</span><strong class="price-value"><small>GHS</small>${Number(now[fuel]).toFixed(2)}</strong><span class="price-unit">per litre</span>${deltaMarkup}</div>`;
      }).join('');
      return `<div class="price-board ${changed?'is-updated':''}" role="group" aria-label="Current pump prices: Super ${money(now.Petrol)} per litre, Diesel ${money(now.Diesel)} per litre"><div class="price-board-head"><span class="price-live"><i class="live-dot"></i>Current pump prices</span><span class="price-updated">${latest?`Updated ${esc(dateShort(String(latest.effectiveAt).slice(0,10)))}`:'Station configuration'}</span></div><div class="price-tiles">${tiles}</div></div>`;
    }
    function operationsHead(title,description,actions,variant='supervisor'){
      return `<header class="ops-hero ${variant==='manager'?'is-manager':''}"><div class="ops-hero-copy"><div class="eyebrow">${variant==='manager'?'MANAGER · OPERATIONS':'OPERATIONS'} · ${esc(dateLong(TODAY))}</div><h1>${title}</h1><p>${description}</p><div class="page-actions">${actions}</div></div><div class="ops-hero-side">${priceBoardMarkup()}</div></header>`;
    }

    /* ---------- pumps & dispensers ---------- */
    function pumpSummary(date=TODAY){
      const rows=readingsForDate(date),priceNow={Petrol:currentFuelPrice('Petrol'),Diesel:currentFuelPrice('Diesel')};
      const dispensers=state.dispensers.filter(dp=>dp.active||rows.some(r=>r.dispenserId===dp.id));
      const fuelTotals={Petrol:{nozzles:0,litres:0,value:0,atCurrent:0},Diesel:{nozzles:0,litres:0,value:0,atCurrent:0}};
      const cards=dispensers.map(dp=>{
        const nozzles=state.nozzles.filter(n=>n.dispenser===dp.id&&(n.active||rows.some(r=>r.nozzleId===n.id))).sort((a,b)=>a.fuel===b.fuel?0:a.fuel==='Petrol'?-1:1);
        const items=nozzles.map(n=>{
          const fuel=n.fuel==='Diesel'?'Diesel':'Petrol',rs=rows.filter(r=>r.nozzleId===n.id);
          const litres=Number(rs.reduce((s,r)=>s+Number(r.litres||0),0).toFixed(1)),value=Number(rs.reduce((s,r)=>s+Number(r.salesValue||0),0).toFixed(2)),atCurrent=Number((litres*priceNow[fuel]).toFixed(2));
          const prices=[...new Set(rs.map(r=>Number(r.price||0).toFixed(2)))];
          if(n.active)fuelTotals[fuel].nozzles+=1;fuelTotals[fuel].litres+=litres;fuelTotals[fuel].value+=value;fuelTotals[fuel].atCurrent+=atCurrent;
          return {nozzle:n,fuel,litres,value,atCurrent,price:priceNow[fuel],prices,records:rs.length,mixedRate:Math.abs(value-atCurrent)>0.009};
        });
        return {dispenser:dp,items,litres:items.reduce((s,i)=>s+i.litres,0),value:items.reduce((s,i)=>s+i.value,0),atCurrent:items.reduce((s,i)=>s+i.atCurrent,0)};
      });
      Object.values(fuelTotals).forEach(t=>{t.litres=Number(t.litres.toFixed(1));t.value=Number(t.value.toFixed(2));t.atCurrent=Number(t.atCurrent.toFixed(2));});
      return {date,cards,priceNow,fuelTotals,dispenserCount:dispensers.length,activeDispensers:dispensers.filter(dp=>dp.active).length,totalLitres:Number((fuelTotals.Petrol.litres+fuelTotals.Diesel.litres).toFixed(1)),totalValue:Number((fuelTotals.Petrol.value+fuelTotals.Diesel.value).toFixed(2)),totalAtCurrent:Number((fuelTotals.Petrol.atCurrent+fuelTotals.Diesel.atCurrent).toFixed(2))};
    }
    function pumpSectionMarkup(date=TODAY){
      const p=pumpSummary(date),maxLitres=Math.max(1,...p.cards.flatMap(card=>card.items.map(item=>item.litres)));
      const chip=(cls,label,count,sub,value)=>`<div class="pump-chip ${cls}"><span class="pump-chip-label">${label}</span><strong>${count}</strong><span class="pump-chip-sub">${sub}</span>${value?`<span class="pump-chip-value">${value}</span>`:''}</div>`;
      const fuelChip=(cls,label,t,price)=>`<div class="pump-chip ${cls}"><span class="pump-chip-label">${label}</span><strong>${money(t.value)}</strong><span class="pump-chip-sub">${litres(t.litres)} · ${t.nozzles} nozzle${t.nozzles===1?'':'s'} · now ${money(price)}/L</span></div>`;
      const summary=`<div class="pump-summary">${fuelChip('super','Super / Petrol',p.fuelTotals.Petrol,p.priceNow.Petrol)}${fuelChip('diesel','Diesel',p.fuelTotals.Diesel,p.priceNow.Diesel)}</div>`;
      if(!p.cards.length)return `<section class="panel pump-section"><div class="panel-head"><div><h2 class="panel-title">Pumps & dispensers</h2><p class="panel-subtitle">No active dispensers are configured for this station.</p></div></div>${summary}</section>`;
      const cards=p.cards.map(card=>{
        const nozzleRows=card.items.map(item=>{
          const cls=item.fuel==='Petrol'?'super':'diesel',label=item.fuel==='Petrol'?'Super':'Diesel';
          const rateNote=item.records?(item.mixedRate?`Recorded at ${item.prices.map(price=>`GHS ${price}`).join(' / ')} · at current rate ${money(item.atCurrent)}`:`@ ${money(item.price)}/L · ${item.records} shift record${item.records===1?'':'s'}`):'No readings yet today';
          return `<div class="pump-nozzle ${cls}" data-tip="${esc(`${card.dispenser.id} ${label}: ${litres(item.litres)} · ${money(item.value)}`)}"><div class="pump-nozzle-top"><span class="fuel-tag ${cls}">${label}</span><span class="pump-nozzle-id">${esc(item.nozzle.id)} → ${esc(item.nozzle.tankId)}</span>${item.nozzle.maintenance&&item.nozzle.maintenance!=='Operational'?`<span class="pump-flag">${esc(item.nozzle.maintenance)}</span>`:''}</div><div class="pump-nozzle-figures"><span><small>Litres sold</small><strong>${litres(item.litres)}</strong></span><span><small>Cash value</small><strong>${money(item.value)}</strong></span></div><div class="pump-meter" role="img" aria-label="${num(item.litres,0)} litres"><span class="width-${Math.round(item.litres/maxLitres*100)}"></span></div><small class="pump-rate">${rateNote}</small></div>`;
        }).join('');
        return `<article class="pump-card ${card.dispenser.active?'':'is-inactive'}"><header class="pump-card-head"><span class="pump-icon">${icon('fuel',16)}</span><div class="pump-card-title"><strong>Pump ${esc(card.dispenser.id)}</strong><small>${card.items.length} nozzle${card.items.length===1?'':'s'} · ${card.dispenser.active?'Active':'Inactive (history)'}</small></div><div class="pump-card-total"><strong>${money(card.value)}</strong><small>${litres(card.litres)} today</small></div></header><div class="pump-nozzles">${nozzleRows}</div></article>`;
      }).join('');
      const mixed=p.cards.some(card=>card.items.some(item=>item.mixedRate));
      return `<section class="panel pump-section" aria-labelledby="pump-section-title"><div class="panel-head"><div><h2 class="panel-title" id="pump-section-title">Pumps & dispensers · ${esc(dateShort(date))}</h2><p class="panel-subtitle">${p.activeDispensers} of ${p.dispenserCount} dispensers active · litres × the price that applied to each reading</p></div><button type="button" class="panel-link" data-action="open-dispenser-report">Dispenser report ${icon('chevron',12)}</button></div>${summary}<div class="pump-grid">${cards}</div>${mixed?`<div class="chart-footnote">${icon('info',12)} A price changed today: cash value uses the rate that applied when each reading was saved (as banked and reported); “at current rate” shows today’s litres re-priced at ${money(p.priceNow.Petrol)} Super / ${money(p.priceNow.Diesel)} Diesel.</div>`:''}</section>`;
    }

    /* ---------- previous-day banking alerts ---------- */
    function bankingAlertState(now=new Date()){
      const today=localDateIso(now),floor=shiftDate(today,-BANKING_LOOKBACK_DAYS);
      const dates=[...new Set(state.readings.map(r=>r.businessDate).filter(Boolean))].filter(date=>date<today&&date>=floor).sort().reverse();
      const items=dates.map(businessDate=>({businessDate,metrics:dailyMetrics(businessDate),summary:depositStatus(businessDate,now)})).filter(item=>item.metrics.sales>0&&item.summary.outstanding>0.005);
      const toBank=Number(items.reduce((s,i)=>s+i.summary.toBank,0).toFixed(2)),awaiting=Number(items.reduce((s,i)=>s+i.summary.pendingAmount,0).toFixed(2)),outstanding=Number(items.reduce((s,i)=>s+i.summary.outstanding,0).toFixed(2));
      const signature=items.filter(i=>i.summary.toBank>0.005).map(i=>i.businessDate).join(',');
      return {items,toBank,awaiting,outstanding,signature,needsBanking:toBank>0.005,awaitingOnly:toBank<=0.005&&outstanding>0.005,previous:items.find(i=>i.businessDate===shiftDate(today,-1))||null};
    }
    function bankingDismissKey(){return `icon-energy-banking-alert:${currentUser?currentUser.id||currentUser.username:''}`;}
    function maybeShowBankingAlert(force=false){
      if(!isSupervisor()||bootRestorePending)return;
      if(modal&&!force)return;
      const bank=bankingAlertState();if(!bank.needsBanking)return;
      let dismissed='';try{dismissed=sessionStorage.getItem(bankingDismissKey())||'';}catch(e){/* ignore */}
      if(!force&&dismissed===bank.signature)return;
      openModal('banking-alert');
    }
    function dismissBankingAlert(){
      const bank=bankingAlertState();try{sessionStorage.setItem(bankingDismissKey(),bank.signature);}catch(e){/* ignore */}
      closeModal();
    }
    function bankingAlertMarkup(){
      const bank=bankingAlertState(),now=new Date();
      if(!bank.items.length)return `<div class="modal-body"><div class="save-detail is-saved">${icon('checkcircle',18)}<span>All previous business days are fully banked and confirmed.</span></div></div><div class="modal-footer"><button type="button" class="btn btn-primary" data-action="close-modal">Close</button></div>`;
      const cards=bank.items.map(({businessDate,metrics,summary})=>{
        const pct=summary.due>0?Math.round(Math.min(100,summary.banked/summary.due*100)):0,pendingPct=summary.due>0?Math.round(Math.min(100-pct,summary.pendingAmount/summary.due*100)):0;
        const overdue=now.getTime()>summary.deadlineAt.getTime();
        return `<article class="banking-alert-item ${overdue?'is-overdue':''}"><div class="banking-alert-item-head"><div><strong>${esc(dateLong(businessDate))}</strong><small>${num(metrics.litres,1)} L sold · ${overdue?'deadline passed':'bank by 10:00 am '+esc(dateShort(summary.deadlineDate))}</small></div>${badge(summary.status,summary.tone)}</div><dl class="banking-figures"><div><dt>Sales recorded</dt><dd>${money(summary.due)}</dd></div><div><dt>Confirmed banked</dt><dd>${money(summary.banked)}</dd></div><div><dt>Awaiting confirmation</dt><dd>${money(summary.pendingAmount)}</dd></div><div class="is-key"><dt>Outstanding to bank</dt><dd>${money(summary.toBank)}</dd></div></dl><div class="banking-progress" role="img" aria-label="${pct}% confirmed, ${pendingPct}% awaiting confirmation"><span class="banked width-${pct}"></span><span class="pending width-${pendingPct}"></span></div>${isSupervisor()&&summary.toBank>0.005?`<button type="button" class="btn btn-small btn-primary" data-action="bank-now" data-date="${esc(businessDate)}">${icon('bank',13)} Record deposit for ${esc(dateShort(businessDate))}</button>`:''}</article>`;
      }).join('');
      const oldest=bank.items.filter(i=>i.summary.toBank>0.005).slice(-1)[0];
      const headline=bank.needsBanking?money(bank.toBank):money(bank.awaiting);
      return `<div class="modal-body banking-alert-body"><div class="banking-alert-hero ${bank.needsBanking?'is-due':'is-pending'}"><span class="banking-alert-icon">${icon('bank',22)}</span><div><span class="banking-alert-kicker">${bank.needsBanking?'Banking confirmation required':'Awaiting Manager confirmation'}</span><strong class="banking-alert-amount">${headline}</strong><span>${bank.needsBanking?`pending banking from ${bank.items.filter(i=>i.summary.toBank>0.005).length} previous business day${bank.items.filter(i=>i.summary.toBank>0.005).length===1?'':'s'}`:'submitted and waiting for the Manager to confirm'}${bank.awaiting>0.005&&bank.needsBanking?` · ${money(bank.awaiting)} already submitted`:''}</span></div></div><div class="banking-alert-list">${cards}</div><p class="banking-alert-note">${icon('info',13)} This reminder stays available from the top bar until every amount is banked and confirmed by the Manager. Deposits can be recorded in stages; the outstanding amount updates after each one.</p></div><div class="modal-footer">${isSupervisor()?`<button type="button" class="btn btn-outline" data-action="dismiss-banking-alert">Remind me later</button>${oldest?`<button type="button" class="btn btn-primary" data-action="bank-now" data-date="${esc(oldest.businessDate)}">${icon('bank',14)} Record bank deposit</button>`:'<button type="button" class="btn btn-primary" data-action="close-modal">OK</button>'}`:`<button type="button" class="btn btn-outline" data-action="close-modal">Close</button><button type="button" class="btn btn-primary" data-page="approvals">Review deposits</button>`}</div>`;
    }
    function bankingPillMarkup(){
      const bank=bankingAlertState();if(bank.outstanding<=0.005)return '';
      const label=bank.needsBanking?'Not banked':'Awaiting confirmation',amount=bank.needsBanking?bank.toBank:bank.awaiting;
      return `<button type="button" class="banking-pill ${bank.needsBanking?'is-due':'is-pending'}" data-action="open-banking-alert" aria-label="${label}: ${money(amount)} from previous business days. Open banking details." title="Previous-day banking status">${icon('bank',15)}<span class="banking-pill-text"><small>${label}</small><strong>${money(amount)}</strong></span></button>`;
    }
    function bankingBannerMarkup(){
      const bank=bankingAlertState();if(bank.outstanding<=0.005)return '';
      const dates=bank.items.map(item=>dateShort(item.businessDate)).slice(0,3).join(', ')+(bank.items.length>3?` +${bank.items.length-3} more`:'');
      if(bank.needsBanking)return `<div class="banking-banner is-due" role="alert"><span class="banking-banner-icon">${icon('alert',18)}</span><div><strong>Previous-day sales not banked · ${money(bank.toBank)} outstanding</strong><span>${esc(dates)} · banking confirmation required${bank.awaiting>0.005?` · ${money(bank.awaiting)} awaiting Manager confirmation`:''}</span></div><div class="banking-banner-actions">${isSupervisor()?`<button type="button" class="btn btn-small btn-primary" data-action="bank-now">${icon('bank',13)} Record deposit</button>`:''}<button type="button" class="btn btn-small btn-outline" data-action="open-banking-alert">Details</button></div></div>`;
      return `<div class="banking-banner is-pending" role="status"><span class="banking-banner-icon">${icon('clock',18)}</span><div><strong>Awaiting Manager confirmation · ${money(bank.awaiting)}</strong><span>${esc(dates)} · banked by the Supervisor, not yet confirmed</span></div><div class="banking-banner-actions">${isManager()?`<button type="button" class="btn btn-small btn-primary" data-page="approvals">Review deposits</button>`:`<button type="button" class="btn btn-small btn-outline" data-action="open-banking-alert">Details</button>`}</div></div>`;
    }

    /* ---------- notifications popover ---------- */
    function notificationItems(){
      const items=[],bank=bankingAlertState();
      if(bank.needsBanking)items.push({tone:'danger',ico:'bank',title:'Previous-day sales not banked',detail:`${money(bank.toBank)} outstanding · confirmation required`,action:'open-banking-alert'});
      else if(bank.awaitingOnly)items.push({tone:'info',ico:'bank',title:'Banking awaiting Manager confirmation',detail:`${money(bank.awaiting)} submitted`,action:isManager()?'':'open-banking-alert',page:isManager()?'approvals':''});
      if(isManager()){
        const queue=allStationReviewQueueCount(),open=openDiscrepancies().length;
        if(queue)items.push({tone:'warning',ico:'check',title:`${queue} item${queue===1?'':'s'} in the review queue`,detail:'Deliveries, meters, prices, deposits and discrepancies across stations',page:'approvals'});
        if(open)items.push({tone:'warning',ico:'alert',title:`${open} open discrepanc${open===1?'y':'ies'}`,detail:'Investigate and authorise adjustments',page:'discrepancies'});
      }else{
        depositReminderTasks(new Date()).filter(task=>task.businessDate===TODAY).forEach(task=>items.push({tone:'warning',ico:'bell',title:'9:00 pm close · bank by 10:00 am',detail:`${money(task.summary.toBank)} for ${dateShort(task.businessDate)}`,action:'bank-now',date:task.businessDate}));
        const pending=pendingDepositApprovals().length,receipts=awaitingReceipt().length,deliveries=pendingDeliveries().length;
        if(pending)items.push({tone:'info',ico:'receipt',title:`${pending} deposit${pending===1?'':'s'} awaiting Manager approval`,detail:'No action needed unless the Manager rejects it',page:'deposits'});
        if(receipts)items.push({tone:'info',ico:'truck',title:`${receipts} approved deliver${receipts===1?'y needs':'ies need'} a receipt`,detail:'Record actual litres and the post-unload dip',page:'deliveries'});
        if(deliveries)items.push({tone:'info',ico:'clock',title:`${deliveries} deliver${deliveries===1?'y':'ies'} awaiting approval`,detail:'Do not unload until the Manager approves',page:'deliveries'});
      }
      if(saveStatus.kind==='error'||saveStatus.kind==='unavailable')items.unshift({tone:'danger',ico:'alert',title:'Records are not being saved',detail:saveStatus.text,action:'storage-status'});
      return items;
    }
    function notificationPopoverMarkup(items){
      const rows=items.map(item=>`<button type="button" class="notif-item tone-${item.tone}" ${item.page?`data-page="${item.page}"`:`data-action="${item.action}"`} ${item.date?`data-date="${esc(item.date)}"`:''}><span class="notif-icon">${icon(item.ico,15)}</span><span class="notif-copy"><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span>${icon('chevron',13)}</button>`).join('');
      return `<div class="notif-popover ${animFlags.popover?'anim-enter':''}" role="dialog" aria-label="Notifications"><div class="notif-head"><strong>Notifications</strong><span class="badge ${items.length?'amber':'green'}">${items.length||'None'}</span></div><div class="notif-list">${rows||`<div class="notif-empty">${icon('checkcircle',18)}<span>You’re all caught up.</span></div>`}</div></div>`;
    }

    /* ---------- chart helpers (real data only) ---------- */
    function chartWidth(kind='full'){
      const vw=typeof window!=='undefined'?window.innerWidth||1280:1280,side=vw>1024?(uiPrefs.sidebarCollapsed?78:264):0,pad=vw>1024?56:vw>680?40:28;
      let w=Math.min(1480,vw-side-pad);const panelPad=vw>680?48:32;
      if(kind==='main'&&vw>1280)w=(w-16)*1.55/2.55;else if(kind==='side'&&vw>1280)w=(w-16)/2.55;else if(kind==='half'&&vw>1100)w=(w-16)/2;
      return Math.max(280,Math.round(w-panelPad));
    }
    function niceMax(value){if(!(value>0))return 1;const p=Math.pow(10,Math.floor(Math.log10(value))),n=value/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p;}
    function compactNumber(value){const v=Number(value)||0,a=Math.abs(v);if(a>=1e6)return `${(v/1e6).toFixed(a>=1e7?0:1)}M`;if(a>=1e3)return `${(v/1e3).toFixed(a>=1e4?0:1)}k`;return String(Math.round(v));}
    function shortDayLabel(date){return dateShort(date).replace(/,?\s+\d{4}$/,'');}
    function trendDays(range=uiPrefs.trendRange){
      return Array.from({length:range},(_,index)=>{const date=shiftDate(TODAY,index-(range-1)),d=dailyMetrics(date);return {date,litres:d.litres,sales:d.sales,petrol:d.petrolLitres,diesel:d.dieselLitres,petrolSales:d.petrolSales,dieselSales:d.dieselSales,collections:d.collectionTotal,difference:d.collectionDifference,readings:d.readings.length};});
    }
    function rangeToggleMarkup(){
      return `<div class="segmented" role="group" aria-label="Chart date range">${[7,14,30].map(range=>`<button type="button" class="segmented-option ${uiPrefs.trendRange===range?'active':''}" aria-pressed="${uiPrefs.trendRange===range}" data-action="trend-range" data-range="${range}">${range}d</button>`).join('')}</div>`;
    }
    function chartEmpty(title,text){return `<div class="chart-empty">${icon('chart',22)}<strong>${esc(title)}</strong><span>${esc(text)}</span></div>`;}
    function xLabelStep(count,width){return Math.max(1,Math.ceil(count/Math.max(2,Math.floor(width/64))));}
    function managerTrendChartMarkup(days,kind='main'){
      if(!days.some(day=>Number(day.readings||0)>0))return chartEmpty('No pump readings in this range','Saved meter readings will plot here. Days without readings are not filled with estimates.');
      const W=chartWidth(kind),H=Math.round(Math.min(300,Math.max(220,W*0.4))),L=46,R=56,T=26,B=30,plotW=W-L-R,plotH=H-T-B,n=days.length;
      const maxL=niceMax(Math.max(...days.map(d=>d.litres))),maxS=niceMax(Math.max(...days.map(d=>d.sales)));
      const x=i=>L+(n<=1?plotW/2:i*plotW/(n-1)),y=(v,max)=>T+plotH-(Math.max(0,v)/max)*plotH;
      const line=key=>days.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(d[key],key==='litres'?maxL:maxS).toFixed(1)}`).join(' ');
      const area=`${line('litres')} L${x(n-1).toFixed(1)},${(T+plotH).toFixed(1)} L${x(0).toFixed(1)},${(T+plotH).toFixed(1)} Z`;
      const grid=[0,.25,.5,.75,1].map(f=>{const gy=(T+plotH*(1-f)).toFixed(1);return `<line class="chart-grid" x1="${L}" y1="${gy}" x2="${W-R}" y2="${gy}"/><text class="chart-axis" x="${L-8}" y="${Number(gy)+4}" text-anchor="end">${compactNumber(maxL*f)}</text><text class="chart-axis" x="${W-R+8}" y="${Number(gy)+4}">${compactNumber(maxS*f)}</text>`;}).join('');
      const step=xLabelStep(n,plotW),labels=days.map((d,i)=>(i%step===0&&(n-1-i>=step*0.6||i===n-1))||i===n-1?`<text class="chart-axis" x="${x(i).toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(shortDayLabel(d.date))}</text>`:'').join('');
      const showPoints=n<=14,slot=n<=1?plotW:plotW/(n-1);
      const points=showPoints?days.map((d,i)=>`<circle class="chart-point volume" cx="${x(i).toFixed(1)}" cy="${y(d.litres,maxL).toFixed(1)}" r="3.5"/><circle class="chart-point sales" cx="${x(i).toFixed(1)}" cy="${y(d.sales,maxS).toFixed(1)}" r="3.5"/>`).join(''):'';
      const hits=days.map((d,i)=>`<rect class="chart-hit" x="${Math.max(L,x(i)-slot/2).toFixed(1)}" y="${T}" width="${Math.max(6,Math.min(slot,W-R-Math.max(L,x(i)-slot/2))).toFixed(1)}" height="${plotH}" tabindex="0" data-tip="${esc(`${dateLong(d.date)} · ${num(d.litres,1)} L sold · ${money(d.sales)} sales · ${d.readings} reading${d.readings===1?'':'s'}`)}"><title>${esc(`${dateShort(d.date)}: ${num(d.litres,1)} L, ${money(d.sales)}`)}</title></rect>`).join('');
      return `<div class="chart-host"><svg class="chart-svg trend-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Station trend ${esc(dateShort(days[0].date))} to ${esc(dateShort(days[n-1].date))}: ${num(days.reduce((s,d)=>s+d.litres,0),0)} litres sold and ${money(days.reduce((s,d)=>s+d.sales,0))} sales value. Area shows litres, line shows sales value."><defs><linearGradient id="trend-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" class="grad-volume-start"/><stop offset="100%" class="grad-volume-end"/></linearGradient></defs><text class="chart-axis-title" x="${L-8}" y="12" text-anchor="end">Litres</text><text class="chart-axis-title" x="${W-R+8}" y="12">GHS</text>${grid}<path class="chart-area volume" d="${area}"/><path class="chart-line volume" pathLength="1" d="${line('litres')}"/><path class="chart-line sales" pathLength="1" d="${line('sales')}"/>${points}${labels}${hits}</svg></div><div class="chart-key"><span><i class="key-swatch volume"></i>Litres sold (left scale)</span><span><i class="key-swatch sales"></i>Sales value, GHS (right scale)</span></div>`;
    }
    function dailyFuelBarsMarkup(days,kind='half'){
      if(!days.some(d=>d.readings>0))return chartEmpty('No litres recorded in this range','Daily Super and Diesel volumes appear once readings are saved.');
      const W=chartWidth(kind),H=Math.round(Math.min(260,Math.max(200,W*0.38))),L=44,R=12,T=16,B=30,plotW=W-L-R,plotH=H-T-B,n=days.length;
      const maxL=niceMax(Math.max(...days.map(d=>d.petrol+d.diesel))),slot=plotW/n,bw=Math.max(4,Math.min(34,slot*0.62));
      const y=v=>plotH*(Math.max(0,v)/maxL);
      const grid=[0,.5,1].map(f=>{const gy=(T+plotH*(1-f)).toFixed(1);return `<line class="chart-grid" x1="${L}" y1="${gy}" x2="${W-R}" y2="${gy}"/><text class="chart-axis" x="${L-8}" y="${Number(gy)+4}" text-anchor="end">${compactNumber(maxL*f)}</text>`;}).join('');
      const step=xLabelStep(n,plotW);
      const bars=days.map((d,i)=>{const cx=L+slot*i+slot/2,hp=y(d.petrol),hd=y(d.diesel),base=T+plotH;return `<g class="bar-group" tabindex="0" data-tip="${esc(`${dateLong(d.date)} · Super ${num(d.petrol,1)} L · Diesel ${num(d.diesel,1)} L`)}"><rect class="chart-bar-hit" x="${(L+slot*i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${plotH}"/>${hp>0?`<rect class="chart-bar super" x="${(cx-bw/2).toFixed(1)}" y="${(base-hp).toFixed(1)}" width="${bw.toFixed(1)}" height="${hp.toFixed(1)}" rx="2"/>`:''}${hd>0?`<rect class="chart-bar diesel" x="${(cx-bw/2).toFixed(1)}" y="${(base-hp-hd).toFixed(1)}" width="${bw.toFixed(1)}" height="${hd.toFixed(1)}" rx="2"/>`:''}${i%step===0||i===n-1?`<text class="chart-axis" x="${cx.toFixed(1)}" y="${H-8}" text-anchor="middle">${esc(shortDayLabel(d.date))}</text>`:''}</g>`;}).join('');
      return `<div class="chart-host"><svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Daily litres by fuel, ${esc(dateShort(days[0].date))} to ${esc(dateShort(days[n-1].date))}: Super ${num(days.reduce((s,d)=>s+d.petrol,0),0)} litres, Diesel ${num(days.reduce((s,d)=>s+d.diesel,0),0)} litres.">${grid}${bars}</svg></div><div class="chart-key"><span><i class="key-swatch super"></i>Super (Petrol) litres</span><span><i class="key-swatch diesel"></i>Diesel litres</span></div>`;
    }
    function donutMarkup({segments,centerValue,centerLabel,ariaLabel,format=value=>money(value),emptyTitle='No data yet',emptyText='Records will populate this chart.'}){
      const total=segments.reduce((s,seg)=>s+Math.max(0,Number(seg.value)||0),0);
      if(total<=0)return chartEmpty(emptyTitle,emptyText);
      const r=70,C=2*Math.PI*r,visible=segments.filter(seg=>seg.value>0);let offset=0;
      const arcs=visible.map(seg=>{const len=C*seg.value/total,gap=visible.length>1?Math.min(3,len*0.3):0,pct=seg.value/total*100;const out=`<circle class="donut-arc viz-${seg.tone}" cx="100" cy="100" r="${r}" stroke-dasharray="${Math.max(0.01,len-gap).toFixed(2)} ${(C-len+gap).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 100 100)" tabindex="0" data-tip="${esc(`${seg.label}: ${format(seg.value)} · ${pct.toFixed(1)}%`)}"><title>${esc(`${seg.label}: ${format(seg.value)}`)}</title></circle>`;offset+=len;return out;}).join('');
      const legend=segments.map(seg=>`<div class="donut-legend-row ${seg.value>0?'':'is-zero'}"><span class="key-swatch viz-${seg.tone}"></span><span class="donut-legend-label">${esc(seg.label)}</span><strong>${format(seg.value)}</strong><small>${total>0?(seg.value/total*100).toFixed(0):0}%</small></div>`).join('');
      return `<div class="donut-layout"><svg class="donut-svg" viewBox="0 0 200 200" role="img" aria-label="${esc(ariaLabel)}"><circle class="donut-track" cx="100" cy="100" r="${r}"/>${arcs}<text class="donut-value" x="100" y="98" text-anchor="middle">${esc(centerValue)}</text><text class="donut-label" x="100" y="120" text-anchor="middle">${esc(centerLabel)}</text></svg><div class="donut-legend">${legend}</div></div>`;
    }
    function tenderDonutMarkup(metric){
      const segments=PAYMENT_KEYS.map(key=>({label:PAYMENT_LABELS[key],value:Number(metric.payments[key]||0),tone:key}));
      return donutMarkup({segments,centerValue:`${metric.collectionTotal>0?Math.round(Number(metric.payments.cash||0)/metric.collectionTotal*100):0}%`,centerLabel:'paid in cash',ariaLabel:`Payment mix totalling ${money(metric.collectionTotal)}: ${segments.map(s=>`${s.label} ${money(s.value)}`).join(', ')}`,emptyTitle:'No tenders recorded today',emptyText:'Cash, mobile money, card and credit totals appear after readings are saved.'});
    }
    /* ---------- tooltip, drawer, sidebar, theme ---------- */
    let tipNode=null;
    function ensureTipNode(){if(!tipNode){tipNode=document.createElement('div');tipNode.className='chart-tip';tipNode.setAttribute('role','tooltip');tipNode.id='chart-tip';tipNode.hidden=true;document.body.appendChild(tipNode);}return tipNode;}
    function showTip(target,clientX,clientY){
      const text=target.getAttribute('data-tip');if(!text)return;const tip=ensureTipNode();tip.textContent=text;tip.hidden=false;
      const rect=target.getBoundingClientRect(),px=clientX??rect.left+rect.width/2,py=clientY??rect.top;
      const tw=tip.offsetWidth,th=tip.offsetHeight,vw=window.innerWidth;
      const left=Math.max(8,Math.min(vw-tw-8,px-tw/2)),top=py-th-12<8?py+16:py-th-12;
      tip.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;tip.classList.add('is-visible');
    }
    function hideTip(){if(tipNode){tipNode.classList.remove('is-visible');tipNode.hidden=true;}}
    function toggleSidebarCollapsed(){
      uiPrefs.sidebarCollapsed=!uiPrefs.sidebarCollapsed;saveUiPrefs();
      const shell=document.querySelector('.app-shell');if(shell)shell.classList.toggle('is-collapsed',uiPrefs.sidebarCollapsed);
      const btn=document.querySelector('[data-action="toggle-sidebar"]');if(btn){btn.setAttribute('aria-expanded',String(!uiPrefs.sidebarCollapsed));btn.setAttribute('aria-label',uiPrefs.sidebarCollapsed?'Expand sidebar':'Collapse sidebar');}
      clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(!modal)render();},320);
    }
    function setDrawer(open){
      drawerOpen=Boolean(open);const shell=document.querySelector('.app-shell');if(shell)shell.classList.toggle('drawer-open',drawerOpen);
      const btn=document.querySelector('[data-action="toggle-drawer"]');if(btn)btn.setAttribute('aria-expanded',String(drawerOpen));
      if(drawerOpen){const first=document.querySelector('.sidebar .nav-item');if(first)setTimeout(()=>first.focus({preventScroll:true}),60);}
    }
    function switchTheme(){
      theme=theme==='dark'?'light':'dark';
      const root=document.documentElement;
      if(!prefersReducedMotion()){root.classList.add('theme-transition');clearTimeout(switchTheme.timer);switchTheme.timer=setTimeout(()=>root.classList.remove('theme-transition'),360);}
      applyTheme(true);
      document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn=>{const isDark=theme==='dark',label=isDark?'Switch to light mode':'Switch to dark mode';btn.setAttribute('aria-label',label);btn.setAttribute('title',label);btn.setAttribute('aria-pressed',String(isDark));btn.innerHTML=icon(isDark?'sun':'moon',16);});
      const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',theme==='dark'?'#04151b':'#eef4f5');
    }
    let resizeTimer=null,lastChartBasis=0;
    function chartBasis(){return chartWidth('full');}
    window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(window.innerWidth>1024&&drawerOpen)setDrawer(false);const basis=chartBasis();if(currentUser&&!modal&&lastChartBasis&&Math.abs(basis-lastChartBasis)/lastChartBasis>0.1)render();},220);});
    document.addEventListener('pointerover',event=>{const target=event.target.closest&&event.target.closest('[data-tip]');if(target)showTip(target,event.clientX,event.clientY);});
    document.addEventListener('pointermove',event=>{const target=event.target.closest&&event.target.closest('[data-tip]');if(target&&tipNode&&!tipNode.hidden)showTip(target,event.clientX,event.clientY);});
    document.addEventListener('pointerout',event=>{const target=event.target.closest&&event.target.closest('[data-tip]');if(target&&!(event.relatedTarget&&target.contains(event.relatedTarget)))hideTip();});
    document.addEventListener('focusin',event=>{const target=event.target.closest&&event.target.closest('[data-tip]');if(target)showTip(target);else hideTip();});
    document.addEventListener('scroll',hideTip,{passive:true,capture:true});

    /* ---------- hash routing (works on any static host without rewrites) ---------- */
    let pendingRoute='';
    function syncRouteFromHash(){const match=/^#\/([a-z-]+)/.exec(location.hash||'');pendingRoute=match?match[1]:'';}
    function routeAllowed(page){return Boolean(currentUser&&PAGE_META[page]&&NAV[currentUser.role].some(item=>item[0]===page));}
    function writeRoute(page,replace=false){const target=`#/${page}`;if(location.hash===target)return;try{history[replace?'replaceState':'pushState'](null,'',target);}catch(e){location.hash=target;}}
    window.addEventListener('popstate',()=>{syncRouteFromHash();if(currentUser&&pendingRoute&&routeAllowed(pendingRoute)&&pendingRoute!==activePage)setPage(pendingRoute,{fromHistory:true});});
    syncRouteFromHash();

    function renderShell() {
      const meta = currentPageMeta();
      const roleName = isManager() ? 'Authorized manager' : 'Supervisor';
      const notes=notificationItems(),urgent=notes.some(item=>item.tone==='danger');
const navGroups = [];
      NAV[currentUser.role].forEach(([page, label, ico, group]) => {
        if (!navGroups.length || navGroups[navGroups.length - 1].group !== group) navGroups.push({ group, items: [] });
        const count = navCount(page);
        navGroups[navGroups.length - 1].items.push(`<button type="button" class="nav-item ${activePage === page ? 'active' : ''}" data-page="${page}" ${activePage===page?'aria-current="page"':''} title="${esc(label)}">${icon(ico, 18)}<span class="nav-text">${label}</span>${count ? `<span class="nav-count" aria-label="${count} pending">${count}</span>` : ''}</button>`);
      });
      const navHtml = navGroups.map((entry, index) => `<div class="nav-group" role="group" aria-labelledby="nav-group-${index}"><div class="nav-group-label" id="nav-group-${index}">${esc(entry.group)}</div>${entry.items.join('')}</div>`).join('');
      const pageContent = renderPage(),stationControl=stationSwitcherMarkup();
      const cloudBoundary=currentUser.authProvider==='supabase'?'<div class="callout form-warning cloud-boundary" role="status"><strong>Cloud sign-in only:</strong> Your identity is verified by Supabase, but station records, users, and operational changes on this screen are still stored in this browser. Do not use this build for live financial operations or assume another device can see these records.</div>':'';
      const collapsed=uiPrefs.sidebarCollapsed;
      return `<div class="app-shell ${collapsed?'is-collapsed':''} ${drawerOpen?'drawer-open':''}"><div class="activity-bar" aria-hidden="true"></div>
        <a class="skip-link" href="#main-content">Skip to content</a>
        <aside class="sidebar" id="app-sidebar" aria-label="Main navigation">
          <div class="sidebar-top">${brandMarkup()}<button type="button" class="sidebar-collapse" data-action="toggle-sidebar" aria-controls="app-sidebar" aria-expanded="${!collapsed}" aria-label="${collapsed?'Expand sidebar':'Collapse sidebar'}">${icon('chevron',16)}</button><button type="button" class="sidebar-close" data-action="close-drawer" aria-label="Close navigation">${icon('close',16)}</button></div>
          <div class="station-chip" title="${esc(state.station.name||'Fuel station')}"><span class="station-dot"></span><div><strong>${esc(state.station.name||'Fuel station')}</strong><span>${isManager()?(managerHomeMode==='aggregate'?'Central oversight · all stations':'Drill-down · station context'):`${esc(state.station.location||'Location not set')} · active station`}</span></div></div>
          <nav class="side-nav" aria-label="Pages"><span class="nav-indicator" aria-hidden="true"></span>${navHtml}</nav>
          <div class="side-spacer"></div>
          <div class="sidebar-note"><div class="sidebar-note-top"><strong>Control status</strong><span class="live-dot"></span></div><p>Audit trail on · every action is attributed.<br>Manager approval required before unloading.</p></div>
          <div class="sidebar-user"><div class="avatar">${esc(currentUser.initials)}</div><div class="sidebar-user-info"><strong>${esc(currentUser.name)}</strong><span>${esc(roleName)}</span></div><button type="button" class="sidebar-logout" aria-label="Change password" title="Change password" data-action="change-password">${icon('lock', 16)}</button><button type="button" class="sidebar-logout" aria-label="Sign out" title="Sign out" data-action="logout">${icon('logout', 16)}</button></div>
        </aside>
        <div class="drawer-scrim" data-action="close-drawer"></div>
        <main class="workspace">
          <header class="topbar">
            <div class="topbar-left"><button type="button" class="topbar-icon-btn drawer-toggle" data-action="toggle-drawer" aria-controls="app-sidebar" aria-expanded="${drawerOpen}" aria-label="Open navigation">${icon('menu',18)}</button>${stationControl}<div class="topbar-page-context">${breadcrumbMarkup(meta)}<div class="topbar-title">${esc(meta.title)}</div></div><button type="button" class="topbar-search" data-action="open-palette" aria-haspopup="dialog" aria-keyshortcuts="Control+K Meta+K" title="Search pages and actions (Ctrl K)">${icon('search',15)}<span class="topbar-search-text">Search or jump to…</span><kbd>Ctrl K</kbd></button></div>
            <div class="topbar-right">${saveStatusMarkup()}${bankingPillMarkup()}${isSupervisor()?`<button class="btn btn-accent topbar-bank-action" type="button" aria-label="Enter or update bank details" title="Enter or update bank details" data-action="supervisor-bank-entry">${icon('bank',15)}<span>Bank details</span></button>`:''}<div class="business-date">${icon('calendar', 14)}<span>${esc(dateLong(TODAY))}</span></div><span class="role-pill ${isManager() ? 'manager' : ''}">${icon(isManager() ? 'shield' : 'user', 12)}<span>${esc(roleName)}</span></span>${themeToggleMarkup()}<div class="notif-wrap"><button class="topbar-icon-btn" type="button" aria-label="Notifications${notes.length?` (${notes.length})`:''}" aria-haspopup="dialog" aria-expanded="${notificationsOpen}" title="Notifications" data-action="notifications">${icon('bell', 17)}${notes.length ? `<span class="notification-dot ${urgent?'is-urgent':''}">${notes.length}</span>` : ''}</button>${notificationsOpen?notificationPopoverMarkup(notes):''}</div></div>
          </header>
          <div class="page-content ${animFlags.page?'anim-enter':''} ${animFlags.charts?'anim-charts':''}" id="main-content" data-page-context="${esc(activePage)}">${cloudBoundary}${pageContent}<footer class="page-footer-note"><span class="storage-chip">${icon('shield', 12)} Saved in this browser’s local database · download a full backup for an off-device copy</span><span>${esc(orgName())} · prices shown come from station configuration</span></footer></div>
        </main>
        ${bottomNavMarkup()}
      </div>${renderModal()}${renderToast()}${renderPalette()}`;
    }

    function renderPage() {
      if (activePage === 'dashboard') return renderDashboard();
      if (activePage === 'stock') return renderStockPage();
      if (activePage === 'deliveries') return renderDeliveriesPage();
      if (activePage === 'readings') return renderReadingsPage();
      if (activePage === 'deposits') return renderDepositsPage();
      if (activePage === 'approvals') return renderApprovalsPage();
      if (activePage === 'discrepancies') return renderDiscrepanciesPage();
      if (activePage === 'reconciliation') return renderReconciliationPage();
      if (activePage === 'reports') return renderReportsPage();
      if (activePage === 'audit') return renderAuditPage();
      if (activePage === 'setup' && isManager()) return renderSetupPage();
      if (activePage === 'data' && isManager()) return renderDataManagementPage();
      return renderDashboard();
    }

    function pageHead(title, description, actions = '', eyebrow = '') {
      const entry = currentUser && NAV[currentUser.role].find(item => item[0] === activePage);
      return `<div class="page-head"><div class="page-head-main">${entry ? `<span class="page-head-icon" aria-hidden="true">${icon(entry[2], 22)}</span>` : ''}<div class="page-head-copy">${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}<h1>${title}</h1><p>${description}</p></div></div><div class="page-actions">${actions}</div></div>`;
    }
    function breadcrumbMarkup(meta) {
      const entry = NAV[currentUser.role].find(item => item[0] === activePage) || [];
      const aggregateMode = isManager() && activePage === 'dashboard' && managerHomeMode !== 'station';
      const crumbs = [aggregateMode
        ? `<li><span>${esc(orgName())}</span></li>`
        : `<li><button type="button" class="crumb-link" data-page="dashboard">${esc(state.station.name || 'Fuel station')}</button></li>`];
      if (entry[3]) crumbs.push(`<li><span>${esc(entry[3])}</span></li>`);
      if (aggregateMode) { crumbs.push(`<li aria-current="page"><span>Organization overview</span></li>`); }
      else if (activePage === 'dashboard' && isManager() && MANAGER_VIEW_LABELS[managerDashboardView]) { crumbs.push(`<li aria-current="page"><span>${esc(MANAGER_VIEW_LABELS[managerDashboardView])}</span></li>`); }
      else crumbs.push(`<li aria-current="page"><span>${esc(entry[1] || meta.title)}</span></li>`);
      return `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${crumbs.join('')}</ol></nav>`;
    }
    function bottomNavMarkup() {
      const items = BOTTOM_NAV[currentUser.role].map(page => NAV[currentUser.role].find(item => item[0] === page)).filter(Boolean).map(([page, label, ico]) => {
        const count = navCount(page);
        return `<button type="button" class="bottom-nav-item ${activePage === page ? 'active' : ''}" data-page="${page}" ${activePage === page ? 'aria-current="page"' : ''}>${icon(ico, 19)}<span>${esc(BOTTOM_LABELS[page] || label)}</span>${count ? `<i class="bottom-nav-count" aria-label="${count} pending">${count}</i>` : ''}</button>`;
      }).join('');
      return `<nav class="bottom-nav" aria-label="Quick navigation">${items}<button type="button" class="bottom-nav-item" data-action="open-palette" aria-haspopup="dialog">${icon('bolt', 19)}<span>Actions</span></button><button type="button" class="bottom-nav-item" data-action="toggle-drawer" aria-controls="app-sidebar" aria-expanded="${drawerOpen}">${icon('menu', 19)}<span>More</span></button></nav>`;
    }
    /* ---------- workflow stage tracks ---------- */
    function stageTrack(steps, label = 'Workflow progress') {
      const words = { done: 'complete', current: 'in progress', todo: 'not started', failed: 'rejected' };
      return `<ol class="stage-track" aria-label="${esc(label)}">${steps.map(step => `<li class="is-${step.state}"><span class="stage-dot" aria-hidden="true"></span><span class="stage-label">${esc(step.label)}<span class="sr-only"> · ${words[step.state]}</span></span></li>`).join('')}</ol>`;
    }
    function deliveryStageTrack(d) {
      const st = d.status;
      return stageTrack([
        { label: d.emergency ? 'Recorded' : 'Registered', state: 'done' },
        { label: 'Approved', state: st === 'pending' ? 'current' : st === 'rejected' ? 'failed' : 'done' },
        { label: d.emergency ? 'Posted' : 'Received', state: st === 'received' ? 'done' : st === 'approved_awaiting_receipt' ? 'current' : st === 'rejected' ? 'todo' : (d.emergency && d.stockApplied ? 'done' : 'todo') }
      ], 'Delivery progress');
    }
    function depositStageTrack(d) {
      if (d.workflow === 'legacy-cash') return '';
      const st = d.status;
      return stageTrack([
        { label: 'Submitted', state: 'done' },
        { label: 'Confirmed', state: st === 'Approved' ? 'done' : st === 'Rejected' ? 'failed' : 'current' },
        { label: 'Banked', state: st === 'Approved' ? 'done' : 'todo' }
      ], 'Deposit progress');
    }
    /* ---------- Supervisor: today's shift checklist (live from records) ---------- */
    function shiftChecklistMarkup() {
      const activeNozzles = state.nozzles.filter(n => n.active);
      const readToday = new Set(state.readings.filter(r => r.businessDate === TODAY).map(r => r.nozzleId));
      const nozzlesDone = activeNozzles.filter(n => readToday.has(n.id)).length;
      const dippedToday = new Set(state.stockReadings.filter(r => r.businessDate === TODAY && !/^Delivery/.test(r.measurementType || '')).map(r => r.tankId));
      const tanksDone = state.tanks.filter(t => dippedToday.has(t.id)).length;
      const bankState = bankingAlertState();
      const receipts = awaitingReceipt().length, waitingDeliveries = pendingDeliveries().length, discrepancyCount = openDiscrepancies().length, maintenanceCount = state.maintenance.filter(mn => ['Open', 'Scheduled'].includes(mn.status)).length, exceptions = discrepancyCount + maintenanceCount;
      const exceptionParts = [discrepancyCount ? `${discrepancyCount} open discrepanc${discrepancyCount === 1 ? 'y' : 'ies'}` : '', maintenanceCount ? `${maintenanceCount} pump maintenance item${maintenanceCount === 1 ? '' : 's'}` : ''].filter(Boolean);
      const cta = (label, attrs) => `<button class="btn btn-small btn-soft" type="button" ${attrs}>${label}</button>`;
      const steps = [
        { title: 'Tank dips', ico: 'tank', state: state.tanks.length && tanksDone >= state.tanks.length ? 'done' : 'todo', detail: `${tanksDone} of ${state.tanks.length} tanks measured today`, action: tanksDone >= state.tanks.length ? '' : cta('Record dip', 'data-action="open-modal" data-modal="stock-reading"') },
        { title: 'Pump readings', ico: 'meter', state: activeNozzles.length && nozzlesDone >= activeNozzles.length ? 'done' : 'todo', detail: `${nozzlesDone} of ${activeNozzles.length} active nozzles read today`, action: activeNozzles.length && nozzlesDone >= activeNozzles.length ? '' : cta('Enter readings', 'data-action="open-modal" data-modal="reading"') },
        { title: 'Previous-day banking', ico: 'bank', state: bankState.needsBanking ? 'todo' : bankState.awaiting > 0.005 ? 'waiting' : 'done', detail: bankState.needsBanking ? 'Closed-day sales still to bank · amount in the banking alert' : bankState.awaiting > 0.005 ? 'Deposit submitted · awaiting Manager confirmation' : 'Closed days banked and confirmed', action: bankState.needsBanking ? cta('Record deposit', 'data-action="supervisor-bank-entry"') : '' },
        { title: 'Deliveries', ico: 'truck', state: receipts ? 'todo' : waitingDeliveries ? 'waiting' : 'done', detail: receipts ? `${receipts} approved deliver${receipts === 1 ? 'y needs' : 'ies need'} a receipt` : waitingDeliveries ? `${waitingDeliveries} awaiting Manager approval` : 'No open deliveries', action: receipts ? cta('Complete receipt', 'data-page="deliveries"') : '' },
        { title: 'Exceptions', ico: 'alert', state: exceptions ? 'waiting' : 'done', detail: exceptions ? `${exceptionParts.join(' · ')} with the Manager` : 'No open discrepancies or maintenance', action: discrepancyCount ? cta('View stock', 'data-page="stock"') : maintenanceCount ? cta('View pumps', 'data-page="readings"') : '' }
      ];
      const done = steps.filter(step => step.state === 'done').length, pct = Math.round(done / steps.length * 100);
      const stateText = { done: 'Complete', todo: 'Your action', waiting: 'With Manager' };
      return `<section class="panel shift-checklist" aria-labelledby="shift-checklist-title"><div class="panel-head"><div><h2 class="panel-title" id="shift-checklist-title">Shift tasks</h2><p class="panel-subtitle">${esc(dateLong(TODAY))} · updates live from this station’s records</p></div><div class="checklist-progress" role="img" aria-label="${done} of ${steps.length} steps complete"><svg viewBox="0 0 36 36" width="46" height="46" aria-hidden="true"><circle class="checklist-ring-track" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="checklist-ring-fill" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${pct} 100"/></svg><span><strong>${done}/${steps.length}</strong> complete</span></div></div><ol class="checklist-steps">${steps.map(step => `<li class="checklist-step is-${step.state}"><span class="checklist-marker" aria-hidden="true">${step.state === 'done' ? icon('check', 15) : icon(step.ico, 15)}</span><div class="checklist-copy"><strong>${step.title}</strong><span>${step.detail}</span></div><span class="checklist-state">${stateText[step.state]}</span>${step.action ? `<div class="checklist-cta">${step.action}</div>` : ''}</li>`).join('')}</ol></section>`;
    }
    /* ---------- Manager: decision inbox across every station ---------- */
    function decisionInboxMarkup() {
      const stations = stationDirectory && Array.isArray(stationDirectory.stations) ? stationDirectory.stations : [];
      const kinds = [
        { label: 'Bank deposits', ico: 'bank', page: 'approvals', pick: data => (data.deposits || []).filter(r => r.workflow === DEPOSIT_WORKFLOW && r.status === 'Pending manager approval') },
        { label: 'Deliveries', ico: 'truck', page: 'approvals', pick: data => (data.deliveries || []).filter(r => r.status === 'pending') },
        { label: 'Price changes', ico: 'money', page: 'approvals', pick: data => (data.priceRequests || []).filter(r => r.status === 'pending') },
        { label: 'Meter adjustments', ico: 'meter', page: 'approvals', pick: data => (data.meterRequests || []).filter(r => r.status === 'pending') },
        { label: 'Discrepancies', ico: 'alert', page: 'discrepancies', pick: data => (data.discrepancies || []).filter(r => r.status === 'Open') }
      ].map(kind => { const rows = stations.flatMap(entry => kind.pick(entry.data || {})); return { ...kind, count: rows.length, oldest: rows.map(r => r.createdAt).filter(Boolean).sort()[0] }; });
      const total = kinds.reduce((sum, kind) => sum + kind.count, 0);
      return `<section class="panel decision-inbox" aria-labelledby="decision-inbox-title"><div class="panel-head"><div><h2 class="panel-title" id="decision-inbox-title">Decision inbox</h2><p class="panel-subtitle">${total ? `${total} item${total === 1 ? '' : 's'} waiting across ${stations.length} station${stations.length === 1 ? '' : 's'}` : 'Nothing is waiting for a decision'}</p></div>${total ? `<button class="btn btn-primary btn-small" type="button" data-page="approvals">${icon('check', 14)} Open queue</button>` : badge('All clear', 'green')}</div><div class="inbox-grid">${kinds.map(kind => `<button type="button" class="inbox-tile ${kind.count ? 'has-items' : ''}" data-page="${kind.page}"><span class="inbox-icon" aria-hidden="true">${icon(kind.ico, 16)}</span><span class="inbox-count">${kind.count}</span><span class="inbox-label">${kind.label}</span><span class="inbox-age">${kind.count && kind.oldest ? `Oldest ${esc(relativeTime(kind.oldest))}` : 'None waiting'}</span></button>`).join('')}</div></section>`;
    }
    /* ---------- command palette (Ctrl/⌘ K) ---------- */
    let paletteOpen = false, paletteQuery = '', paletteIndex = 0, paletteReturnFocus = null, paletteJustOpened = false;
    function paletteItems() {
      const items = [], add = (group, label, ico, attrs, keywords = '') => items.push({ group, label, ico, attrs, keywords });
      if (isSupervisor()) {
        add('Actions', 'Record pump readings', 'meter', 'data-action="open-modal" data-modal="reading"', 'meter shift nozzle sales litres');
        add('Actions', 'Record tank dip', 'tank', 'data-action="open-modal" data-modal="stock-reading"', 'stock physical measurement dip');
        add('Actions', 'Register incoming delivery', 'truck', 'data-action="open-modal" data-modal="delivery"', 'tanker supplier delivery');
        add('Actions', 'Enter bank deposit', 'bank', 'data-action="supervisor-bank-entry"', 'banking deposit slip receipt');
        awaitingReceipt().forEach(d => add('Actions', `Complete receipt · ${d.id}`, 'checkcircle', `data-action="open-modal" data-modal="complete-receipt" data-id="${esc(d.id)}"`, 'delivery receipt dip unload'));
        add('Actions', 'Request price change', 'money', 'data-action="open-modal" data-modal="price-request"', 'price pricing');
        add('Actions', 'Request meter adjustment', 'wrench', 'data-action="open-modal" data-modal="meter-request"', 'meter correction');
        add('Actions', 'Flag pump maintenance', 'alert', 'data-action="open-modal" data-modal="maintenance"', 'pump fault repair');
      }
      if (isManager()) {
        const queue = allStationReviewQueueCount();
        add('Actions', `Review approvals${queue ? ` · ${queue} waiting` : ''}`, 'check', 'data-page="approvals"', 'approve reject queue decisions');
        add('Actions', 'Download full backup', 'download', 'data-action="export-full-backup"', 'export backup json off-device');
        add('Actions', 'Create recovery point', 'shield', 'data-action="create-recovery-point"', 'snapshot save version');
        add('Actions', 'View or restore recovery points', 'refresh', 'data-action="manage-auto-backups"', 'restore snapshot version');
        (stationDirectory && stationDirectory.stations || []).filter(entry => entry.id !== activeStationId).forEach(entry => add('Stations', `Switch to ${entry.name}`, 'fuelmark', `data-action="switch-station" data-id="${esc(entry.id)}"`, `${entry.location || ''} station site`));
      }
      NAV[currentUser.role].forEach(([page, label, ico, group]) => add('Go to', label, ico, `data-page="${page}"`, `${group} ${PAGE_META[page] ? PAGE_META[page].description : ''}`));
      const light = document.documentElement.dataset.theme === 'light';
      add('Preferences', `Switch to ${light ? 'dark' : 'light'} theme`, light ? 'moon' : 'sun', 'data-action="toggle-theme"', 'theme dark light mode appearance');
      add('Preferences', 'Change my password', 'lock', 'data-action="change-password"', 'password account security');
      add('Preferences', 'Sign out', 'logout', 'data-action="logout"', 'logout exit');
      return items;
    }
    function filteredPaletteItems() {
      const terms = paletteQuery.trim().toLowerCase().split(/\s+/).filter(Boolean), items = paletteItems();
      return terms.length ? items.filter(item => { const hay = `${item.label} ${item.group} ${item.keywords}`.toLowerCase(); return terms.every(term => hay.includes(term)); }) : items;
    }
    function paletteListMarkup() {
      const items = filteredPaletteItems();
      if (paletteIndex >= items.length) paletteIndex = Math.max(0, items.length - 1);
      if (!items.length) return `<div class="palette-empty">${icon('search', 18)}<span>No pages or actions match “${esc(paletteQuery)}”.</span></div>`;
      let group = '';
      return items.map((item, index) => { const head = item.group !== group ? `<div class="palette-group" role="presentation">${esc(item.group)}</div>` : ''; group = item.group; return `${head}<button type="button" class="palette-item ${index === paletteIndex ? 'is-active' : ''}" role="option" id="palette-opt-${index}" aria-selected="${index === paletteIndex}" tabindex="-1" ${item.attrs}><span class="palette-icon" aria-hidden="true">${icon(item.ico, 16)}</span><span class="palette-label">${esc(item.label)}</span>${item.group === 'Go to' ? '<span class="palette-hint">Page</span>' : ''}</button>`; }).join('');
    }
    function renderPalette() {
      if (!paletteOpen || !currentUser) return '';
      const items = filteredPaletteItems();
      return `<div class="palette-backdrop ${paletteJustOpened ? 'anim-enter' : ''}"><div class="palette" role="dialog" aria-modal="true" aria-label="Search pages and actions"><div class="palette-search">${icon('search', 17)}<input id="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" ${items.length ? `aria-activedescendant="palette-opt-${Math.min(paletteIndex, items.length - 1)}"` : ''} placeholder="Search pages and actions…" autocomplete="off" spellcheck="false" value="${esc(paletteQuery)}"><kbd>Esc</kbd></div><div class="palette-list" id="palette-list" role="listbox" aria-label="Results">${paletteListMarkup()}</div><div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><span class="palette-foot-role">${isManager() ? 'Manager' : 'Supervisor'} actions only</span></div></div></div>`;
    }
    function focusDescriptor(el) {
      if (!el || el === document.body || !el.closest) return null;
      if (el.id) return `#${CSS.escape(el.id)}`;
      const scope = el.closest('.topbar') ? '.topbar ' : el.closest('.sidebar') ? '.sidebar ' : el.closest('.bottom-nav') ? '.bottom-nav ' : '.page-content ';
      const attrs = ['action', 'page', 'modal', 'id', 'view'].filter(key => el.dataset && el.dataset[key]).map(key => `[data-${key}="${CSS.escape(el.dataset[key])}"]`).join('');
      if (attrs) return scope + attrs;
      const cls = [...el.classList].filter(name => !/^(active|is-|anim-)/.test(name))[0];
      return cls ? scope + '.' + CSS.escape(cls) : null;
    }
    function openPalette() {
      if (!currentUser || modal) return;
      paletteReturnFocus = focusDescriptor(document.activeElement); paletteOpen = true; paletteQuery = ''; paletteIndex = 0; paletteJustOpened = true; notificationsOpen = false;
      if (drawerOpen) drawerOpen = false;
      render();
      const input = document.getElementById('palette-input'); if (input) input.focus();
    }
    function closePalette(restoreFocus = true) {
      paletteOpen = false;
      const node = document.querySelector('.palette-backdrop'); if (node) node.remove();
      if (restoreFocus && paletteReturnFocus) { const target = document.querySelector(paletteReturnFocus) || document.querySelector('.topbar-search'); if (target) target.focus({ preventScroll: true }); }
      paletteReturnFocus = null;
    }
    function refreshPaletteList() {
      const list = document.getElementById('palette-list'), input = document.getElementById('palette-input');
      if (!list) return;
      list.innerHTML = paletteListMarkup();
      const count = list.querySelectorAll('.palette-item').length;
      if (input) { if (count) input.setAttribute('aria-activedescendant', `palette-opt-${paletteIndex}`); else input.removeAttribute('aria-activedescendant'); }
      const active = list.querySelector('.palette-item.is-active'); if (active) active.scrollIntoView({ block: 'nearest' });
    }
    function paletteKeys(event) {
      const key = event.key;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && String(key).toLowerCase() === 'k' && currentUser) { event.preventDefault(); event.stopPropagation(); if (paletteOpen) closePalette(); else openPalette(); return; }
      if (!paletteOpen) {
        if (key === '/' && currentUser && !modal && !event.target.closest('input, textarea, select, [contenteditable="true"]')) { event.preventDefault(); openPalette(); }
        return;
      }
      if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePalette(); return; }
      if (key === 'ArrowDown' || key === 'ArrowUp') { event.preventDefault(); const count = document.querySelectorAll('.palette-item').length; if (!count) return; paletteIndex = (paletteIndex + (key === 'ArrowDown' ? 1 : -1) + count) % count; refreshPaletteList(); return; }
      if (key === 'Enter') { const active = document.querySelector('.palette-item.is-active'); if (active) { event.preventDefault(); active.click(); } return; }
      if (key === 'Tab') { event.preventDefault(); const input = document.getElementById('palette-input'); if (input) input.focus(); }
    }
    /* ---------- typed input survives re-renders (validation errors, toasts, saves) ---------- */
    let lastSubmitKey = '', dropDraftKey = '';
    function formDraftKey(form) {
      const modalNode = form.closest('.modal');
      const scope = modalNode ? `modal:${modalNode.dataset.modalKey || ''}` : 'page';
      return `${scope}|${form.id || `${form.className}:${form.dataset.stationId || ''}`}`;
    }
    function captureFormDrafts() {
      const drafts = [];
      document.querySelectorAll('#app form').forEach(form => {
        if (form.id === 'login-form') return;
        const key = formDraftKey(form);
        if (key === dropDraftKey) return;
        const fields = [];
        [...form.elements].forEach(el => {
          if (!el.name || ['file', 'hidden', 'submit', 'button', 'reset', 'password'].includes(el.type)) return;
          if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked !== el.defaultChecked) fields.push({ name: el.name, value: el.value, checked: el.checked, kind: 'check' }); return; }
          if (el.tagName === 'SELECT') { const changed = [...el.options].some(opt => opt.selected !== opt.defaultSelected); if (changed) fields.push({ name: el.name, value: el.value, kind: 'value' }); return; }
          if (el.value !== el.defaultValue) fields.push({ name: el.name, value: el.value, kind: 'value' });
        });
        if (fields.length) drafts.push({ key, fields });
      });
      return drafts;
    }
    function restoreFormDrafts(drafts) {
      if (!drafts.length) return;
      const forms = [...document.querySelectorAll('#app form')];
      drafts.forEach(draft => {
        const form = forms.find(candidate => formDraftKey(candidate) === draft.key); if (!form) return;
        draft.fields.forEach(field => {
          const matches = [...form.elements].filter(el => el.name === field.name);
          if (field.kind === 'check') { const el = matches.find(candidate => candidate.value === field.value); if (el) el.checked = field.checked; }
          else { const el = matches[0]; if (el && el.type !== 'file') el.value = field.value; }
        });
      });
    }
    /* ---------- post-render decoration: modal identity, inline errors, indicators, counters ---------- */
    let navIndicatorY = null;
    function positionNavIndicator() {
      const nav = document.querySelector('.side-nav'), ind = nav && nav.querySelector('.nav-indicator'), active = nav && nav.querySelector('.nav-item.active');
      if (!ind) { navIndicatorY = null; return; }
      if (!active) { ind.classList.remove('is-visible'); return; }
      const y = active.offsetTop, h = active.offsetHeight;
      if (navIndicatorY !== null && navIndicatorY !== y && !prefersReducedMotion()) { ind.classList.add('no-transition'); ind.style.transform = `translateY(${navIndicatorY}px)`; ind.style.height = `${h}px`; void ind.offsetWidth; ind.classList.remove('no-transition'); }
      ind.style.transform = `translateY(${y}px)`; ind.style.height = `${h}px`; ind.classList.add('is-visible'); navIndicatorY = y;
    }
    function animateCounters() {
      if (prefersReducedMotion()) return;
      const targets = [];
      document.querySelectorAll('.page-content .stat-value, .page-content .kpi-count').forEach(el => {
        if (/[A-Za-z]/.test(el.textContent.replace(/GHS|\bL\b|\bcm\b|\/L/g, ''))) return; // only pure figures animate
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node;
        while ((node = walker.nextNode())) {
          const text = node.nodeValue, match = /\d[\d,]*(\.\d+)?/.exec(text); if (!match) continue;
          const raw = match[0], value = Number(raw.replace(/,/g, '')); if (!Number.isFinite(value) || value === 0) continue;
          targets.push({ node, text, before: text.slice(0, match.index), after: text.slice(match.index + raw.length), value, decimals: match[1] ? match[1].length - 1 : 0, grouped: raw.includes(',') });
        }
      });
      if (!targets.length) return;
      const start = performance.now(), duration = 650;
      const fmt = (value, t) => value.toLocaleString('en-US', { minimumFractionDigits: t.decimals, maximumFractionDigits: t.decimals, useGrouping: t.grouped });
      targets.forEach(t => { t.node.nodeValue = t.before + fmt(0, t) + t.after; });
      const step = now => { const progress = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - progress, 3); let alive = false; targets.forEach(t => { if (!t.node.isConnected) return; alive = true; t.node.nodeValue = progress >= 1 ? t.text : t.before + fmt(t.value * eased, t) + t.after; }); if (alive && progress < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    function stampModalKey() {
      const modalNode = document.querySelector('.modal');
      if (modalNode && modal) modalNode.dataset.modalKey = `${modal.type}:${modal.id || ''}`;
    }
    function captureModalFocus() {
      const el = document.activeElement;
      if (!el || !el.name || !el.closest || !el.closest('.modal form')) return null;
      let caret = null; try { caret = typeof el.selectionStart === 'number' ? [el.selectionStart, el.selectionEnd] : null; } catch (error) { caret = null; }
      return { form: formDraftKey(el.form), name: el.name, value: el.type === 'radio' || el.type === 'checkbox' ? el.value : null, caret };
    }
    function restoreModalFocus(info) {
      if (!info || paletteOpen) return;
      const form = [...document.querySelectorAll('.modal form')].find(candidate => formDraftKey(candidate) === info.form); if (!form) return;
      const el = [...form.elements].find(candidate => candidate.name === info.name && (info.value === null || candidate.value === info.value)); if (!el) return;
      el.focus({ preventScroll: true });
      if (info.caret) { try { el.setSelectionRange(info.caret[0], info.caret[1]); } catch (error) { /* not a text field */ } }
    }
    function decorateAfterRender(entering) {
      if (modal && modal.error) {
        const form = document.querySelector('.modal form');
        if (form && !form.querySelector('.form-error-banner')) {
          const host = form.querySelector('.modal-body') || form;
          host.insertAdjacentHTML('afterbegin', `<div class="form-error-banner" role="alert">${icon('alert', 16)}<div><strong>${esc(modal.error.title)}</strong>${modal.error.detail ? `<span>${esc(modal.error.detail)}</span>` : ''}</div></div>`);
          const banner = host.querySelector('.form-error-banner'); if (banner && banner.scrollIntoView) banner.scrollIntoView({ block: 'nearest' });
        }
      }
      const timer = document.querySelector('.toast-timer'); if (timer && toast && toast.shownAt) timer.style.animationDelay = `-${Date.now() - toast.shownAt}ms`;
      positionNavIndicator();
      if (entering) animateCounters();
      if (paletteOpen) { paletteJustOpened = false; const input = document.getElementById('palette-input'); if (input && document.activeElement !== input) input.focus({ preventScroll: true }); }
    }
    function toneClass(tone = '') {
      const value=String(tone).toLowerCase();
      if(value.includes('success')||value.includes('green'))return 'tone-success';
      if(value.includes('warning')||value.includes('amber'))return 'tone-warning';
      if(value.includes('alert')||value.includes('red'))return 'tone-alert';
      return '';
    }
    function statCard(label, value, foot, ico, tone = '') {
      return `<article class="stat-card"><div class="stat-top"><span class="stat-label">${label}</span><span class="stat-icon ${toneClass(tone)}">${icon(ico, 16)}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;
    }
    function tankCard(metric) {
      const m = metric;
      const varClass = Math.abs(m.variance) > m.tolerance ? 'variance-neg' : (m.variance >= 0 ? 'variance-pos' : 'variance-ok');
      const label = Math.abs(m.variance) > m.tolerance ? 'Investigate' : 'Within tolerance';
      return `<div class="tank-row">
        <div class="tank-row-top"><div class="tank-name"><span class="tank-symbol">${icon('tank', 15)}</span><div><strong>${esc(m.tank.id)} · ${esc(m.tank.fuel)}</strong><span>${esc(m.tank.name)} · ${num(m.tank.capacity, 0)} L capacity</span></div></div><div class="tank-figures"><strong>${num(m.physical, 0)} L</strong><span>physical · expected ${num(m.expected, 0)} L</span></div></div>
        <div class="tank-progress ${m.tank.fuel === 'Petrol' ? 'super' : 'diesel'}" role="img" aria-label="${num(m.pct, 0)}% of capacity"><span class="width-${Math.max(0, Math.min(100, Math.round(m.pct)))}"></span></div>
        <div class="tank-row-foot"><span>${num(m.pct, 0)}% capacity · available ${num(m.available, 0)} L</span><span class="${varClass}">${signedLitres(m.variance)} · ${label}</span></div>
      </div>`;
    }
    function recentActivity(limit = 4) {
      return sortRecords(state.audit).slice(0, limit).map(a => `<div class="recent-row"><span class="recent-icon">${icon(a.action.toLowerCase().includes('deposit') ? 'bank' : a.action.toLowerCase().includes('delivery') ? 'truck' : a.action.toLowerCase().includes('pump') ? 'meter' : 'clipboard', 14)}</span><div><strong>${esc(a.action)}</strong><span>${esc(a.record)} · ${esc(a.user)}</span></div><time>${esc(relativeTime(a.at))}</time></div>`).join('') || `<div class="table-empty">No activity has been recorded yet.</div>`;
    }
    function managerDashboardTabs() {
      const tabs=[['stock','Tank stock','Levels, value & movement','tank'],['sales','Sales & tenders','Dispensers & payment mix','money'],['performance','Performance','Trends · 7, 14 or 30 days','trend']];
      return `<div class="manager-dashboard-switch" role="tablist" aria-label="Manager dashboard views">${tabs.map(([id,title,sub,ico])=>`<button type="button" class="manager-dashboard-tab ${managerDashboardView===id?'active':''}" role="tab" aria-selected="${managerDashboardView===id}" data-action="manager-dashboard-view" data-view="${id}"><span class="manager-tab-icon">${icon(ico,15)}</span><span><strong>${title}</strong><small>${sub}</small></span></button>`).join('')}</div>`;
    }
    function renderManagerTankView() {
      const stocks=state.tanks.map(tank=>tankMetrics(tank,TODAY));
      const cards=stocks.map(metric=>{
        const fuelLabel=metric.tank.fuel==='Petrol'?'Super / Petrol':'Diesel',tankClass=metric.tank.fuel==='Petrol'?'super':'diesel';
        const capacity=Math.max(1,Number(metric.tank.capacity||0)),percent=Math.max(0,Math.min(100,metric.physical/capacity*100)),freeCapacity=Math.max(0,capacity-metric.physical);
        const over=Math.abs(metric.variance)>metric.tolerance,circumference=2*Math.PI*76,fuelArc=circumference*percent/100;
        const ring=`<svg class="tank-pie-svg" viewBox="0 0 220 220" role="img" aria-label="${fuelLabel} tank ${Math.round(percent)} percent full: ${num(metric.physical,0)} of ${num(capacity,0)} litres"><circle class="tank-pie-track" cx="110" cy="110" r="76"/><circle class="tank-pie-stock ${tankClass}" cx="110" cy="110" r="76" stroke-dasharray="${fuelArc.toFixed(2)} ${(circumference-fuelArc).toFixed(2)}" stroke-dashoffset="${circumference.toFixed(2)}" transform="rotate(-90 110 110)"/><text class="tank-pie-value" x="110" y="108" text-anchor="middle">${Math.round(percent)}%</text><text class="tank-pie-unit" x="110" y="132" text-anchor="middle">of capacity</text></svg>`;
        const facts=[
          ['Free capacity',litres(freeCapacity),`Headroom below the ${litres(capacity)} limit`],
          ['Restricted stock',litres(metric.restricted||0),'Excluded from available to sell'],
          ['Stock at purchase cost',money(metric.inventoryCostValue),'Tank balance × purchase cost/L · not revenue'],
          ['Variance tolerance',litres(metric.tolerance),over?'Variance is outside tolerance · investigate':'Variance is within tolerance']
        ];
        return `<article class="panel tank-detail-card"><div class="panel-head"><div><h2 class="panel-title">${fuelLabel}</h2><p class="panel-subtitle">${esc(metric.tank.id)} · ${esc(metric.tank.name)} · last measured ${esc(timeShort(metric.tank.dipAt))}</p></div>${badge(over?'Variance review':'Within tolerance',over?'amber':'green')}</div><div class="tank-detail-layout"><div class="tank-detail-ring">${ring}</div><dl class="tank-detail-list">${facts.map(([label,value,note])=>`<div><dt>${label}</dt><dd><strong>${value}</strong><small>${note}</small></dd></div>`).join('')}</dl></div></article>`;
      }).join('');
      return `<div class="content-grid equal tank-detail-grid">${cards}</div>
        ${tankLedgerTable(stocks,`Stock movement · ${esc(dateShort(TODAY))}`,'Opening + approved receipts − litres sold ± authorised adjustments = expected close, compared with the measured tank balance.')}`;
    }
    function renderManagerSalesView() {
      const metric=dailyMetrics(TODAY);
      return `${pumpSectionMarkup(TODAY)}<div class="content-grid equal">${paymentPanelMarkup(metric,'h2')}${managerStationComparisonMarkup()}</div>`;
    }
    function managerStationComparisonMarkup() {
      const rows=stationDirectory.stations.map(entry=>{
        const readings=Array.isArray(entry.data&&entry.data.readings)?entry.data.readings:[];
        const current=readings.filter(row=>row.businessDate===TODAY);
        return {id:entry.id,name:entry.name||entry.id,litres:current.reduce((sum,row)=>sum+Number(row.litres||0),0),sales:current.reduce((sum,row)=>sum+Number(row.salesValue||0),0),count:current.length};
      });
      if(!rows.some(row=>row.count>0))return `<section class="panel chart-panel"><div class="panel-head"><div><h2 class="panel-title">Station comparison · today</h2><p class="panel-subtitle">Metered sales value across Manager-accessible stations.</p></div></div><div class="chart-empty"><strong>No station readings for today</strong><span>Recorded nozzle activity will appear here; blank stations are not assigned fabricated values.</span></div></section>`;
      const max=Math.max(1,...rows.map(row=>row.sales));
      const bars=rows.map(row=>row.count?`<div class="comparison-bar-row" title="${esc(row.name)}: ${litres(row.litres)} · ${money(row.sales)}"><div class="comparison-bar-caption"><strong>${esc(row.name)}</strong><span>${litres(row.litres)} · ${money(row.sales)}</span></div><div class="comparison-bar-track"><span class="comparison-bar-fill width-${Math.round(Math.min(100,row.sales/max*100))}"></span></div></div>`:`<div class="comparison-bar-row comparison-no-data"><div class="comparison-bar-caption"><strong>${esc(row.name)}</strong><span>No readings recorded</span></div></div>`).join('');
      return `<section class="panel chart-panel"><div class="panel-head"><div><h2 class="panel-title">Station comparison · today</h2><p class="panel-subtitle">Saved meter sales value across all Manager-accessible stations · ${esc(dateShort(TODAY))}.</p></div><span class="badge plum">${rows.length} station${rows.length === 1 ? '' : 's'}</span></div><div class="comparison-bars">${bars}</div><div class="chart-footnote">Bar length = GHS sales value · labels show recorded litres and value.</div></section>`;
    }

    function renderManagerPerformanceView() {
      const range=uiPrefs.trendRange,dates=Array.from({length:range},(_,index)=>shiftDate(TODAY,index-(range-1)));
      const days=trendDays(range);
      const totalLitres=days.reduce((sum,day)=>sum+day.litres,0),totalSales=days.reduce((sum,day)=>sum+day.sales,0),totalDifference=days.reduce((sum,day)=>sum+day.difference,0);
      const activeDispensers=state.dispensers.filter(dispenser=>dispenser.active);
      const weekReadings=state.readings.filter(reading=>reading.businessDate>=dates[0]&&reading.businessDate<=TODAY);
      const performanceDispensers=state.dispensers.filter(dispenser=>dispenser.active||weekReadings.some(reading=>reading.dispenserId===dispenser.id));
      const byDispenser=performanceDispensers.map(dispenser=>{const rows=weekReadings.filter(reading=>reading.dispenserId===dispenser.id);return {id:dispenser.id,active:dispenser.active,litres:rows.reduce((sum,row)=>sum+Number(row.litres||0),0),sales:rows.reduce((sum,row)=>sum+Number(row.salesValue||0),0),records:rows.length};});
      const maxDispenserLitres=Math.max(1,...byDispenser.map(item=>item.litres));
      const supervisorTotals=new Map();
      weekReadings.forEach(reading=>{const name=String(reading.createdBy||'Unassigned Supervisor');const item=supervisorTotals.get(name)||{name,litres:0,sales:0,records:0};item.litres+=Number(reading.litres||0);item.sales+=Number(reading.salesValue||0);item.records++;supervisorTotals.set(name,item);});
      const supervisorPerformance=[...supervisorTotals.values()].sort((a,b)=>b.sales-a.sales);
      const maxSupervisorSales=Math.max(1,...supervisorPerformance.map(item=>item.sales));
      const supervisorRows=supervisorPerformance.map(item=>`<div class="comparison-bar-row" title="${esc(item.name)}: ${litres(item.litres)} · ${money(item.sales)} across ${item.records} readings"><div class="comparison-bar-caption"><strong>${esc(item.name)}</strong><span>${litres(item.litres)} · ${money(item.sales)}</span></div><div class="comparison-bar-track"><span class="comparison-bar-fill supervisor-fill width-${Math.round(Math.min(100,item.sales/maxSupervisorSales*100))}"></span></div></div>`).join('')||`<div class="chart-empty compact"><strong>No Supervisor readings in range</strong><span>The selected seven-day period has no saved readings.</span></div>`;
      const dispenserRows=byDispenser.map((item,index)=>`<div class="performance-dispenser-row"><div class="performance-dispenser-name">${esc(item.id)}<small>${item.records} shift record${item.records===1?'':'s'} · ${item.active?'Active':'Inactive history'}</small></div><div class="manager-chart-track"><span class="manager-chart-fill ${index%2?'collections':'sales'} width-${Math.round(Math.max(0,Math.min(100,item.litres/maxDispenserLitres*100)))}"></span></div><strong class="manager-chart-value">${litres(item.litres)} · ${money(item.sales)}</strong></div>`).join('')||`<div class="table-empty">No active dispensers are configured.</div>`;
      const dailyRows=days.slice().reverse().map(day=>`<div class="performance-daily-row"><span><strong>${esc(dateShort(day.date))}</strong><span class="table-muted">${day.readings} nozzle records</span></span><span>${litres(day.litres)}<br><span class="table-muted">${money(day.collections)} tenders</span></span><strong>${money(day.sales)}<br><span class="table-muted">${signedMoney(day.difference)} gap</span></strong></div>`).join('');
      return `<div class="stats-grid three kpi-row">${statCard(`Fuel sold · ${range} days`,`${num(totalLitres,0)} <small class="unit-label">L</small>`,`<span>Average ${litres(totalLitres/range)} a day, zero-sales days included</span>`,'fuel')}${statCard(`Sales value · ${range} days`,`<span class="stat-money">${money(totalSales)}</span>`,'<span>Litres × the price applied to each reading</span>','money')}${statCard(`Sales vs tenders · ${range} days`,`<span class="stat-money">${signedMoney(totalDifference)}</span>`,Math.abs(totalDifference)<=1?'<span>Tenders match metered sales</span>':'<span>Unreconciled difference across the range</span>','compare',Math.abs(totalDifference)<=1?'success':'alert')}</div>
        <div class="content-grid equal">${trendPanelMarkup('half','h2')}
          <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Performance by dispenser</h2><p class="panel-subtitle">Last ${range} days · dispenser meter readings.</p></div><span class="badge green">${activeDispensers.length} active</span></div><div>${dispenserRows}</div><div class="comparison-subhead">Supervisor sales · last 7 days</div><div class="comparison-bars compact">${supervisorRows}</div><div class="callout reconcile-note">${icon('info',15)}<span>Each active dispenser contributes one Super/Petrol meter and one Diesel meter to station totals. Supervisor bars are grouped from the saved reading submitter.</span></div></section></div>
        <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Daily station scorecard</h2><p class="panel-subtitle">Volume, revenue and collection difference over the last ${range} days.</p></div><span class="permission-lock">${icon('calendar',12)}Most recent first</span></div><div class="performance-daily-list">${dailyRows}</div></section>`;
    }
    function renderManagerStationOverview(){
      const entry=stationEntryById(activeStationId);
      if(!entry)return '';
      const metrics=dailyMetrics(TODAY),stocks=state.tanks.map(tank=>tankMetrics(tank,TODAY));
      const activePumps=state.dispensers.filter(dispenser=>dispenser.active).length,activeNozzles=state.nozzles.filter(nozzle=>nozzle.active).length,combinedCapacity=state.tanks.reduce((sum,tank)=>sum+Number(tank.capacity||0),0),siteTolerance=Number(state.station.varianceTolerance||0);
      const supervisors=state.users.filter(user=>user.role==='supervisor'&&assignedStationIds(user).includes(activeStationId));
      const facts=[esc(state.station.location||'Location not set'),`${activePumps} pump${activePumps===1?'':'s'} · ${activeNozzles} nozzle${activeNozzles===1?'':'s'}`,`${num(combinedCapacity,0)} L tank capacity`,`${num(siteTolerance,0)} L variance tolerance`,`Supervisors: ${supervisors.map(user=>esc(user.name)).join(', ')||'none assigned'}`];
      return `<section class="panel manager-station-overview" aria-labelledby="manager-station-overview-title"><div class="manager-overview-head"><div><span class="manager-overview-kicker">Selected station · today</span><h2 id="manager-station-overview-title">${esc(state.station.name)}</h2><p class="manager-overview-facts">${facts.map(fact=>`<span>${fact}</span>`).join('')}</p></div><div class="manager-overview-picker">${stationSwitcherMarkup(true)}</div></div>${todayKpis(metrics,stocks)}</section>`;
    }
    /* Manager aggregate home: the station card for one managed station, built only from its own data. */
    function managerStationCardMarkup(row) {
      const meters = row.stock.rows.map(tank => {
        const fuelClass = tank.fuel === 'Petrol' ? 'super' : 'diesel';
        const pct = Math.round(Math.max(0, Math.min(100, tank.pct)));
        return `<div class="org-meter" role="img" aria-label="${esc(tank.id)} ${tank.fuel}: ${pct}% full, ${num(tank.physical, 0)} of ${num(tank.capacity, 0)} litres"><div class="org-meter-caption"><span>${esc(tank.id)} · ${esc(tank.fuel)}</span><span>${pct}%</span></div><div class="org-meter-track ${fuelClass}"><span class="fill width-${pct}"></span></div></div>`;
      }).join('') || `<div class="org-meter-empty">No tanks configured for this station yet.</div>`;
      const hasReadings = row.day.readings.length > 0;
      const pendingDetail = row.pending.total
        ? [row.pending.deliveries ? `${row.pending.deliveries} delivery` : '', row.pending.deposits ? `${row.pending.deposits} deposit` : '', row.pending.priceRequests + row.pending.meterRequests ? `${row.pending.priceRequests + row.pending.meterRequests} request` : '', row.pending.openDiscrepancies ? `${row.pending.openDiscrepancies} exception` : ''].filter(Boolean).join(' · ')
        : 'Nothing awaiting review';
      // Manager accountability view: who is authorized to operate this station right now.
      const assignedSupervisors = (stationDirectory && Array.isArray(stationDirectory.users) ? stationDirectory.users : [])
        .filter(user => user.role === 'supervisor' && assignedStationIds(user).includes(row.id))
        .map(user => user.name);
      const supervisorLine = assignedSupervisors.length ? `Supervisors: ${assignedSupervisors.join(', ')}` : 'No Supervisor assigned yet';
      return `<article class="panel org-station-card ${row.isActive ? 'is-active' : ''}" aria-label="${esc(row.name)}">
        <div class="org-station-card-head">
          <div><span class="org-station-kicker">${row.isActive ? 'Active station context' : 'Managed station'}</span><h3>${esc(row.name)}</h3><p>${esc(row.location || 'Location not set')}</p></div>
          ${row.pending.total ? `<span class="badge amber">${row.pending.total} awaiting</span>` : `<span class="badge green">Clear</span>`}
        </div>
        <div class="org-station-stats">
          <div><strong>${hasReadings ? num(row.day.litres, 0) : '—'}<small class="unit-label"> L</small></strong><span>litres today</span></div>
          <div><strong>${hasReadings ? money(row.day.sales) : '—'}</strong><span>sales today</span></div>
          <div><strong>${row.pumps} · ${row.nozzles}</strong><span>pumps · nozzles</span></div>
        </div>
        <div class="org-station-meters">${meters}</div>
        <div class="org-station-card-foot">
          <span class="org-station-pending">${esc(supervisorLine)} · ${esc(pendingDetail)}</span>
          <button type="button" class="btn btn-outline btn-small" data-action="manager-open-station" data-id="${esc(row.id)}">Open station ${icon('chevron', 13)}</button>
        </div>
      </article>`;
    }
    /* Manager's true landing surface: aggregate the whole organization, never one station's data. */
    function renderManagerAggregateHome() {
      const rows = managerAggregateRows(TODAY);
      const totals = managerAggregateTotals(rows);
      const approvals = allStationReviewQueueCount();
      const actions = `<button type="button" class="btn btn-outline" data-page="setup">${icon('wrench',14)} Stations & pumps</button><button type="button" class="btn btn-primary" data-page="approvals">${icon('check',14)} Approval queue${approvals?` · ${approvals}`:''}</button>`;
      const stationWord = `${rows.length} station${rows.length === 1 ? '' : 's'}`;
      const kpis = `<div class="stats-grid kpi-row">
        ${statCard(`Fuel sold · ${stationWord}`, `${num(totals.litres,0)} <small class="unit-label">L</small>`, totals.readings ? `<span>${totals.reporting} of ${rows.length} reporting today</span>` : '<span>No meter readings saved yet today</span>', 'fuel')}
        ${statCard(`Sales value · ${stationWord}`, `<span class="stat-money">${money(totals.sales)}</span>`, `<span>Sum of metered sales across all regional stations</span>`, 'money')}
        ${statCard('Fuel in tanks · organization', `${num(totals.physical,0)} <small class="unit-label">L</small>`, `<span>${Math.round(totals.stockPct)}% of ${num(totals.capacity,0)} L combined capacity</span>`, 'tank')}
        ${statCard('Pending decisions', `${num(totals.pending,0)}`, totals.pending ? `<span>Waiting across your region</span>` : '<span>Nothing waiting across all stations</span>', totals.pending ? 'alert' : 'checkcircle', totals.pending ? 'warning' : 'success')}
      </div>`;
      return `${operationsHead(`Good ${greeting()}, ${esc(currentUser.name.split(' ')[0])}`, `Regional business oversight · live aggregate of ${stationWord}. Open a station for its full operational detail.`, actions, 'manager')}
        ${bankingBannerMarkup()}
        ${decisionInboxMarkup()}
        ${sectionHead('Organization at a glance', `All regional stations · ${esc(dateLong(TODAY))}`)}
        ${kpis}
        ${sectionHead('Station oversight', 'Each card is computed from that station’s own saved records · open one for stock, sales and performance drill-down')}
        <div class="org-stations-grid">${rows.map(managerStationCardMarkup).join('')}</div>
        ${managerStationComparisonMarkup()}`;
    }
    function managerStationContextBar() {
      const entry = stationEntryById(activeStationId);
      if (!entry) return '';
      return `<div class="manager-context-bar" role="note"><button type="button" class="btn btn-soft btn-small" data-action="manager-show-all">${icon('chevron',14)} All stations overview</button><span class="manager-context-note">${icon('fuel',14)}<span>Station drill-down · figures below belong to <strong>${esc(state.station.name || entry.name || activeStationId)}</strong> only</span></span></div>`;
    }
    function renderManagerDashboard() {
      if(!['stock','sales','performance'].includes(managerDashboardView))managerDashboardView='stock';
      // Aggregate home is the default and the fallback whenever no station drill-down is possible.
      if(managerHomeMode!=='station'||!stationEntryById(activeStationId))return renderManagerAggregateHome();
      const approvals=allStationReviewQueueCount();
      const actions=`<button type="button" class="btn btn-soft" data-action="manager-show-all">${icon('grid',14)} All stations</button><button type="button" class="btn btn-outline" data-page="setup">${icon('wrench',14)} Stations & pumps</button><button type="button" class="btn btn-primary" data-page="approvals">${icon('check',14)} Review approvals${approvals?` · ${approvals}`:''}</button>`;
      const view=managerDashboardView==='sales'?renderManagerSalesView():managerDashboardView==='performance'?renderManagerPerformanceView():renderManagerTankView();
      return `${operationsHead(`Good ${greeting()}, ${esc(currentUser.name.split(' ')[0])}`,'Station drill-down · one station in its full operational context. Return to All stations for the aggregate view.',actions,'manager')}${bankingBannerMarkup()}${decisionInboxMarkup()}${managerStationContextBar()}${renderManagerStationOverview()}${managerDashboardTabs()}<div class="manager-dashboard-view" role="tabpanel" aria-label="${esc(MANAGER_VIEW_LABELS[managerDashboardView])}">${view}</div>`;
    }
    function renderDashboard() {
      if(isManager())return renderManagerDashboard();
      const m = dailyMetrics(TODAY);
      const stocks = state.tanks.map(t => tankMetrics(t, TODAY));
      const actions = `<button type="button" class="btn btn-primary" data-action="open-modal" data-modal="reading">${icon('plus', 15)} Record pump readings</button><button type="button" class="btn btn-outline" data-action="open-modal" data-modal="delivery">${icon('truck', 15)} Register delivery</button><button class="btn btn-outline" type="button" aria-label="Enter or update bank details" title="Enter or update bank details" data-action="supervisor-bank-entry">${icon('bank', 15)} Bank details</button>`;
      const byline = 'Here’s your station pulse for today. Keep the records clear, one shift at a time.';
      return `${operationsHead(`Good ${greeting()}, ${esc(currentUser.name.split(' ')[0])}`, byline, actions)}
        ${bankingBannerMarkup()}
        ${sectionHead('Today at a glance', `${esc(state.station.name)} · ${esc(dateLong(TODAY))}`)}
        ${todayKpis(m, stocks)}
        ${shiftChecklistMarkup()}
        ${pumpSectionMarkup(TODAY)}
        ${sectionHead('Sales trend and tenders', 'Metered sales over time, and how today was paid')}
        <div class="content-grid">${trendPanelMarkup('main')}${paymentPanelMarkup(m)}</div>
        ${sectionHead('Stock and activity', 'Each tank against its expected balance, and the latest recorded changes')}
        <div class="content-grid">
          <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Tank stock position</h3><p class="panel-subtitle">Latest measured balance vs expected closing · ${esc(dateShort(TODAY))}</p></div><button type="button" class="panel-link" data-page="stock">Reconciliation ${icon('chevron', 12)}</button></div><div class="tank-list">${stocks.map(tankCard).join('')}</div></section>
          <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent activity</h3><p class="panel-subtitle">Latest operational changes and audit events</p></div><button type="button" class="panel-link" data-page="audit">Audit trail ${icon('chevron', 12)}</button></div><div class="recent-list">${recentActivity(5)}</div></section>
        </div>`;
    }
    function sectionHead(title, meta = '', action = '') {
      return `<div class="section-head"><div><h2 class="section-title">${title}</h2>${meta ? `<p class="section-meta">${meta}</p>` : ''}</div>${action}</div>`;
    }
    /* One KPI row per context: what was sold, what it is worth, whether the money matches, what is in the ground. */
    function todayKpis(m, stocks) {
      const physical = stocks.reduce((sum, t) => sum + t.physical, 0);
      const hasReadings = m.readings.length > 0, matched = Math.abs(m.collectionDifference) <= 1;
      const split = stocks.map(t => `${t.tank.fuel === 'Petrol' ? 'Super' : 'Diesel'} ${Math.round(t.pct)}%`).join(' · ');
      return `<div class="stats-grid kpi-row">
        ${statCard('Fuel sold', `${num(m.litres, 0)} <small class="unit-label">L</small>`, hasReadings ? `<span>Super ${litres(m.petrolLitres)} · Diesel ${litres(m.dieselLitres)}</span>` : '<span>No meter readings saved yet today</span>', 'fuel')}
        ${statCard('Sales value', `<span class="stat-money">${money(m.sales)}</span>`, '<span>Litres × the price applied to each reading</span>', 'money')}
        ${statCard('Sales vs tenders', `<span class="stat-money">${hasReadings ? signedMoney(m.collectionDifference) : money(0)}</span>`, hasReadings ? (matched ? '<span>Every cedi of metered sales is tendered</span>' : '<span>Meter sales minus all tenders · resolve before banking</span>') : '<span>Compared once readings are saved</span>', 'compare', hasReadings ? (matched ? 'success' : 'alert') : '')}
        ${statCard('Tank stock', `${num(physical, 0)} <small class="unit-label">L</small>`, `<span>${esc(split)} of capacity</span>`, 'tank')}
      </div>`;
    }
    function trendPanelMarkup(kind = 'main', heading = 'h3') {
      const days = trendDays(), range = uiPrefs.trendRange, mode = uiPrefs.trendView === 'fuel' ? 'fuel' : 'total';
      const modes = `<div class="segmented" role="group" aria-label="Chart measure">${[['total', 'Litres & sales'], ['fuel', 'By fuel']].map(([id, label]) => `<button type="button" class="segmented-option ${mode === id ? 'active' : ''}" aria-pressed="${mode === id}" data-action="trend-mode" data-mode="${id}">${label}</button>`).join('')}</div>`;
      const title = mode === 'fuel' ? 'Daily litres by fuel' : 'Litres sold and sales value';
      return `<section class="panel chart-panel"><div class="panel-head"><div><${heading} class="panel-title">${title}</${heading}><p class="panel-subtitle">Last ${range} days · ${esc(dateShort(days[0].date))} – ${esc(dateShort(TODAY))} · saved meter readings</p></div><div class="panel-tools">${modes}${rangeToggleMarkup()}</div></div>${mode === 'fuel' ? dailyFuelBarsMarkup(days, kind) : managerTrendChartMarkup(days, kind)}</section>`;
    }
    function paymentPanelMarkup(m, heading = 'h3') {
      const manager = isManager();
      return `<section class="panel chart-panel"><div class="panel-head"><div><${heading} class="panel-title">Payment mix · today</${heading}><p class="panel-subtitle">${manager ? 'Reconcile meter sales against every tender channel, not cash alone' : 'How today’s metered sales were paid'}</p></div><button type="button" class="panel-link" data-page="${manager ? 'reconciliation' : 'deposits'}">${manager ? 'Reconciliation' : 'Banking'} ${icon('chevron', 12)}</button></div>${tenderDonutMarkup(m)}${m.collectionTotal > 0 ? `<div class="panel-total"><span>Total tenders recorded</span><strong>${money(m.collectionTotal)}</strong></div>` : ''}</section>`;
    }
    /* Movement ledger: the single authoritative litre reconciliation (stock page, Manager tank view). */
    function tankLedgerTable(stocks, title, subtitle, tools = '') {
      const t = stocks.reduce((sum, m) => ({ capacity: sum.capacity + Number(m.tank.capacity || 0), opening: sum.opening + m.opening, deliveries: sum.deliveries + m.deliveries, sold: sum.sold + m.litresSold, adjustments: sum.adjustments + m.adjustments, expected: sum.expected + m.expected, physical: sum.physical + m.physical, available: sum.available + m.available }), { capacity: 0, opening: 0, deliveries: 0, sold: 0, adjustments: 0, expected: 0, physical: 0, available: 0 });
      const L = value => num(value, 1);
      const rows = stocks.map(m => {
        const over = Math.abs(m.variance) > m.tolerance, pct = Math.max(0, Math.min(100, Math.round(m.pct)));
        return `<tr><td><strong>${esc(m.tank.id)} · ${esc(m.tank.fuel)}</strong><span class="ledger-fill ${m.tank.fuel === 'Petrol' ? 'super' : 'diesel'}" role="img" aria-label="${pct}% of capacity"><span class="width-${pct}"></span></span><span class="table-muted">${pct}% of ${num(m.tank.capacity, 0)} L</span></td><td>${L(m.opening)}</td><td>${L(m.deliveries)}</td><td>${L(m.litresSold)}</td><td>${signedLitres(m.adjustments, 1, false)}</td><td><strong>${L(m.expected)}</strong></td><td><strong>${L(m.physical)}</strong><span class="table-muted">${timeShort(m.tank.dipAt)}</span></td><td>${L(m.available)}${m.restricted ? `<span class="table-muted">${num(m.restricted, 0)} restricted</span>` : ''}</td><td class="${over ? 'text-danger' : ''}"><strong>${signedLitres(m.variance, 1, false)}</strong>${badge(over ? 'Investigate' : 'Within tolerance', over ? 'red' : 'green')}</td></tr>`;
      }).join('');
      const totalRow = `<tr class="u-fc6e3a9c"><td><strong>Station total</strong><span class="table-muted">${num(t.capacity, 0)} L capacity</span></td><td><strong>${L(t.opening)}</strong></td><td><strong>${L(t.deliveries)}</strong></td><td><strong>${L(t.sold)}</strong></td><td><strong>${signedLitres(t.adjustments, 1, false)}</strong></td><td><strong>${L(t.expected)}</strong></td><td><strong>${L(t.physical)}</strong></td><td><strong>${L(t.available)}</strong></td><td><strong>${signedLitres(t.physical - t.expected, 1, false)}</strong></td></tr>`;
      return `<section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><div><h2 class="panel-title">${title}</h2><p class="panel-subtitle">${subtitle}</p></div></div><div class="toolbar-right">${tools}<span class="badge blue">All figures in litres</span></div></div><div class="table-wrap"><table class="ledger-table"><thead><tr><th>Tank</th><th>Opening</th><th>Approved receipts</th><th>Sold</th><th>Adjustments</th><th>Expected close</th><th>Tank balance</th><th>Available</th><th>Variance</th></tr></thead><tbody>${rows}${totalRow}</tbody></table></div></section>`;
    }
    function greeting() {
      const hour = new Date().getHours();
      return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    }

    function renderStockPage() {
      const actions = isSupervisor() ? `<button class="btn btn-primary" data-action="open-modal" data-modal="stock-reading">${icon('plus', 15)} Record physical dip</button>` : `<span class="permission-lock">${icon('eye', 13)} Review-only access</span>`;
      const stocks = state.tanks.map(t => tankMetrics(t, TODAY));
      const totals = stocks.reduce((sum, m) => ({ expected: sum.expected + m.expected, physical: sum.physical + m.physical, cost: sum.cost + m.inventoryCostValue }), { expected: 0, physical: 0, cost: 0 });
      const outside = stocks.filter(m => Math.abs(m.variance) > m.tolerance).length;
      const history = sortRecords(state.stockReadings).slice(0,8).map(r => `<tr><td>${dateShort(r.businessDate)}</td><td><strong>${esc(r.tankId)}</strong></td><td>${esc(r.measurementType||'Closing stock')}${r.dipReading==null?'':`<span class="table-muted">${num(r.dipReading,1)} cm dip</span>`}</td><td>${num(r.physical,1)}</td><td>${esc(r.method)}</td><td>${esc(r.createdBy)}</td><td>${timeShort(r.createdAt)}</td><td>${esc(r.remarks || '—')}</td></tr>`).join('') || `<tr><td class="table-empty" colspan="8">No readings or balance postings recorded.</td></tr>`;
      return `${pageHead('Tank stock reconciliation', 'Separate calculated expected stock from measured physical stock. Discrepancies are investigated, not automatically labelled as loss.', actions)}
        <div class="stats-grid kpi-row">${statCard('Tank balance',`${num(totals.physical,0)} <small class="unit-label">L</small>`,`<span>Latest dip or approved refill · ${stocks.length} tank${stocks.length===1?'':'s'}</span>`,'tank')}${statCard('Expected closing',`${num(totals.expected,0)} <small class="unit-label">L</small>`,'<span>Opening + approved receipts − sales ± adjustments</span>','chart')}${statCard('Variance vs expected',signedLitres(totals.physical-totals.expected),outside?`<span>${outside} tank${outside===1?'':'s'} outside tolerance · investigate</span>`:'<span>Every tank within tolerance</span>','compare',outside?'alert':'success')}${statCard('Stock at purchase cost',`<span class="stat-money">${money(totals.cost)}</span>`,'<span>Tank balance × purchase cost/L · not revenue</span>','money')}</div>
        ${tankLedgerTable(stocks, `Daily reconciliation · ${esc(dateShort(TODAY))}`, 'Opening + approved receipts − litres sold ± authorised adjustments = expected close. Sales prices affect GHS revenue only; an unapproved delivery never increases stock.', `<span class="permission-lock">${icon('shield',13)}${isManager()?'Manager review view':'Dips and refill postings are audit logged'}</span>`)}
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><div><h2 class="panel-title">Tank balance and dip history</h2><p class="panel-subtitle">Approved balance postings and measured dips are appended separately; earlier records are kept for audit.</p></div></div><div class="toolbar-right"><span class="badge blue">Balances in litres</span></div></div><div class="table-wrap"><table><thead><tr><th>Business date</th><th>Tank</th><th>Reading stage</th><th>Tank balance</th><th>Method / source</th><th>Recorded by</th><th>Time</th><th>Remarks</th></tr></thead><tbody>${history}</tbody></table></div></section>`;
    }
    function deliveryStatusText(d) {
      if (d.status === 'pending') return 'Pending approval';
      if (d.status === 'approved_awaiting_receipt') return 'Approved · awaiting receipt';
      if (d.status === 'received') return 'Received & recorded';
      if (d.status === 'rejected') return 'Rejected';
      return d.status;
    }
    function renderDeliveriesPage() {
      const actions = `<button class="btn btn-primary" data-action="open-modal" data-modal="delivery">${icon('plus', 15)} Register incoming tanker</button>`;
      const all = sortRecords(state.deliveries);
      const filtered = all.filter(d => deliveryFilter === 'all' || (deliveryFilter === 'pending' && d.status === 'pending') || (deliveryFilter === 'approved' && ['approved_awaiting_receipt','received'].includes(d.status)) || (deliveryFilter === 'received' && d.status === 'received') || (deliveryFilter === 'rejected' && d.status === 'rejected'));
      const rows = filtered.map(d => {
        let action = '<span class="text-muted">—</span>';
        if (d.status === 'approved_awaiting_receipt') action = `<button class="btn btn-small btn-soft" data-action="open-modal" data-modal="complete-receipt" data-id="${esc(d.id)}">Complete receipt</button>`;
        else if (d.status === 'pending') action = `<span class="table-muted">Waiting on manager</span>`;
        const dipText=(reading,volume,stage)=>`${reading==null?'Dip not recorded':`${num(reading,1)} cm`}<span class="table-muted">${num(volume,1)} L ${stage}</span>`;
        const dipPair = `${dipText(d.preDipReading,d.preStock,'before')}<span class="table-muted">${d.postStock == null ? 'Post-delivery volume pending' : dipText(d.postDipReading,d.postStock,'after')}</span>`;
        const balance = d.stockApplied ? `${num(d.previousTankBalance ?? d.preStock,1)} → ${num(d.updatedTankBalance ?? (d.emergency?d.postStock:Number(d.preStock)+Number(d.approvedQty||0)),1)} L<span class="table-muted">${d.receivedAt?'Dip reconciled':'Approved posting'} · approved ${num(d.approvedQty ?? d.actualQty ?? d.statedQty,1)} L</span>` : d.status==='approved_awaiting_receipt'?'Not posted<span class="table-muted">Legacy approval · receipt posting pending</span>':'Not posted<span class="table-muted">Awaiting manager approval</span>';
        return `<tr><td><span class="table-ref">${esc(d.id)}</span><span class="table-muted">${dateShort(d.businessDate)} · ${d.emergency ? 'Exception receipt' : 'Pre-unload approval'}</span></td><td><strong>${esc(d.supplier)}</strong><span class="table-muted">${esc(d.driver)} · ${esc(d.contact)}</span><span class="table-muted">${esc(d.vehicle)} · DN ${esc(d.deliveryNote)}${d.deliveryDocName?` · ${esc(d.deliveryDocName)}`:''}</span></td><td>${esc(d.fuelType)}<span class="table-muted">Receiving tank ${esc(d.tankId)}</span></td><td>${num(d.statedQty,0)} L on note<span class="table-muted">${d.approvedQty == null ? 'Not approved' : `Manager approved ${num(d.approvedQty,1)} L`}</span><span class="table-muted">${d.actualQty == null ? 'Actual receipt pending' : `Actually received ${num(d.actualQty,1)} L`}</span></td><td>${dipPair}</td><td>${balance}</td><td>${badge(deliveryStatusText(d))}${deliveryStageTrack(d)}</td><td>${esc(d.createdBy)}<span class="table-muted">${timeShort(d.createdAt)}</span></td><td><div class="row-actions">${action}</div></td></tr>`;
      }).join('') || `<tr><td class="table-empty" colspan="9">No deliveries match this filter.</td></tr>`;
      const pendingCount = pendingDeliveries().length;
      const receiptCount = awaitingReceipt().length;
      return `${pageHead('Fuel delivery register', 'Capture tanker, dip readings and volumes. Manager approval posts the approved quantity once; receipt details reconcile the tank balance.', actions)}
        <div class="content-grid three">
          ${statCard('Awaiting approval', String(pendingCount), '<span>Manager decision required before unloading</span>', 'clock')}
          ${statCard('Approved, receipt pending', String(receiptCount), '<span>Record actual litres and post-unload dip</span>', 'truck')}
          ${statCard('Approved deliveries today', String(state.deliveries.filter(d => d.businessDate===TODAY && d.stockApplied).length), '<span>Approved litres post once; receipt dips reconcile</span>', 'check')}
        </div>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Delivery records</span><div class="segmented" role="tablist">${[['all','All'],['pending','Pending'],['approved','Approved'],['received','Received'],['rejected','Rejected']].map(([key,label])=>`<button type="button" class="segment ${deliveryFilter===key?'active':''}" data-action="delivery-filter" data-filter="${key}">${label}</button>`).join('')}</div></div><div class="toolbar-right"><span class="permission-lock">${icon('shield',13)}Supervisor submissions require manager approval</span></div></div><div class="table-wrap"><table><thead><tr><th>Reference / date</th><th>Supplier / tanker</th><th>Fuel / receiving tank</th><th>Supplier / approved / actual volume</th><th>Tank dip / volume before & after</th><th>Tank balance</th><th>Status</th><th>Submitted by</th><th>Next step</th></tr></thead><tbody>${rows}</tbody></table></div></section>
        <div class="callout u-d6f2af6e">${icon('info',15)}<span><strong>Receiving control:</strong> a Manager confirms the approved quantity and posts it to the selected tank once. The Supervisor later records actual receipt and the post-delivery dip/volume; variances are retained for review. Dip-to-volume conversion is not inferred without calibration data.</span></div>`;
    }

    function shiftRank(shift) { return SHIFT_ORDER[shift] || 0; }
    function openingFor(nozzleId, date, shift) {
      const targetRank = shiftRank(shift);
      const events = [];
      state.readings.filter(r => r.nozzleId === nozzleId && (r.businessDate < date || (r.businessDate === date && shiftRank(r.shift) < targetRank))).forEach(r => events.push({ date: r.businessDate, rank: shiftRank(r.shift), at: r.createdAt, value: Number(r.closing), kind: 'reading' }));
      state.meterAdjustments.filter(a => a.nozzleId === nozzleId && a.status === 'Authorized' && (a.businessDate < date || (a.businessDate === date && shiftRank(a.shift) <= targetRank))).forEach(a => events.push({ date: a.businessDate, rank: shiftRank(a.shift), at: a.authorizedAt, value: Number(a.newReading), kind: 'adjustment' }));
      events.sort((a,b) => a.date.localeCompare(b.date) || a.rank-b.rank || new Date(a.at)-new Date(b.at));
      return events.length ? Number(events[events.length - 1].value) : 0;
    }
    function readingExists(nozzleId, date, shift) { return state.readings.some(r => r.nozzleId === nozzleId && r.businessDate === date && r.shift === shift); }
    function renderReadingsPage() {
      const actions = isSupervisor() ? `<button class="btn btn-outline" data-action="open-modal" data-modal="maintenance">${icon('wrench', 14)} Flag maintenance</button><button class="btn btn-outline" data-action="open-modal" data-modal="meter-request">${icon('refresh', 14)} Request meter adjustment</button><button class="btn btn-outline" data-action="open-modal" data-modal="price-request">${icon('money', 14)} Request price change</button><button type="button" class="btn btn-primary" data-action="open-modal" data-modal="reading">${icon('plus', 15)} Enter shift readings</button>` : `<span class="permission-lock">${icon('eye',13)}Review-only access</span>`;
      const m = dailyMetrics(readingDate);
      const rows = sortRecords(readingsForDate(readingDate)).map(r => {
        const collection = sumPayments(r.payments);
        const gap = Number((r.salesValue - collection).toFixed(2));
        return `<tr><td>${dateShort(r.businessDate)}<span class="table-muted">${esc(r.shift)} shift</span></td><td><strong>${esc(r.dispenserId)}</strong><span class="table-muted">${esc(r.nozzleLabel)} · ${esc(r.nozzleId)}</span></td><td>${esc(r.fuelType)}</td><td>${num(r.opening,1)} L</td><td>${num(r.closing,1)} L</td><td><strong>${num(r.litres,1)} L</strong></td><td>${money(r.price)}</td><td><strong>${money(r.salesValue)}</strong></td><td>${money(collection)}${Math.abs(gap)>1?`<span class="table-muted text-danger">${money(gap)} gap</span>`:''}</td><td>${esc(r.createdBy)}<span class="table-muted">${timeShort(r.createdAt)}</span></td></tr>`;
      }).join('') || `<tr><td class="table-empty" colspan="10">No pump readings recorded for ${dateShort(readingDate)}.</td></tr>`;
      const nozzleCards = state.nozzles.map(n => {
        const last = state.readings.filter(r => r.nozzleId === n.id).sort((a,b) => b.businessDate.localeCompare(a.businessDate) || shiftRank(b.shift)-shiftRank(a.shift))[0];
        return `<div class="tank-row"><div class="tank-row-top"><div class="tank-name"><span class="tank-symbol">${icon('meter',15)}</span><div><strong>${esc(n.dispenser)} · ${esc(n.label)}</strong><span>${esc(n.fuel)} · supplied by ${esc(n.tankId)} · ${money(n.price)}/L</span></div></div><div class="tank-figures"><strong>${last?num(last.closing,1):'—'} L</strong><span>last closing meter</span></div></div><div class="tank-row-foot u-8a77e5a3"><span>${esc(n.id)} · ${n.active?'Active':'Inactive'}</span>${badge(n.maintenance,n.maintenance==='Operational'?'green':'amber')}</div></div>`;
      }).join('');
      const priceCards=['Petrol','Diesel'].map(fuel=>{const last=latestPriceChange(fuel);const nozzleCount=state.nozzles.filter(n=>n.active&&n.fuel===fuel).length;return `<div class="tank-row"><div class="tank-row-top"><div class="tank-name"><span class="tank-symbol">${icon('money',15)}</span><div><strong>${esc(fuel)} · approved selling price</strong><span>${nozzleCount} active nozzle${nozzleCount===1?'':'s'} use this rate${last?` · last approved ${dateTime(last.effectiveAt)}`:''}</span></div></div><div class="tank-figures"><strong>${money(currentFuelPrice(fuel))}</strong><span>GHS per litre</span></div></div></div>`;}).join('');
      const priceRequests=sortRecords(state.priceRequests).slice(0,4).map(r=>`<tr><td><span class="table-ref">${esc(r.id)}</span><span class="table-muted">${dateTime(r.createdAt)}</span></td><td>${esc(r.fuelType)}</td><td>${money(r.currentPrice)} → <strong>${money(r.proposedPrice)}</strong></td><td>${badge(r.status)}</td><td>${esc(r.decision?r.decision.approver:'Awaiting manager')}</td></tr>`).join('')||`<tr><td colspan="5" class="table-empty">No price change requests have been submitted.</td></tr>`;
      return `${pageHead('Pump readings & sales', 'Readings are retained by business date, shift, dispenser and nozzle. A shift opens on the previous authorized closing meter.', actions)}
        <div class="stats-grid">${statCard('Litres sold', `${num(m.litres,0)} L`, `<span>${m.readings.length} nozzle records · ${esc(dateShort(readingDate))}</span>`, 'fuel')}${statCard('Super volume', `${num(m.petrolLitres,0)} L`, `<span>Sales value ${money(m.petrolSales)}</span>`, 'tank')}${statCard('Diesel volume', `${num(m.dieselLitres,0)} L`, `<span>Sales value ${money(m.dieselSales)}</span>`, 'tank')}${statCard('Recorded sales value', `<span class="stat-money">${money(m.sales)}</span>`, `<span>Sales vs tenders ${signedMoney(m.collectionDifference)}</span>`, 'money')}</div>
        <section class="panel u-2b583d73"><div class="panel-head"><div><h2 class="panel-title">Approved selling prices</h2><p class="panel-subtitle">Prices apply by fuel type across active nozzles. A supervisor request does not change the rate until manager approval.</p></div>${isSupervisor()?`<button class="btn btn-small btn-outline" data-action="open-modal" data-modal="price-request">${icon('plus',12)} Request change</button>`:`${badge('Manager approved','green')}`}</div><div class="tank-list">${priceCards}</div><div class="callout u-d60550f6">${icon('info',15)}<span>After approval, new readings use the approved price. Existing readings retain their saved price snapshot. Price changes affect GHS sales value only; tank stock and dispensed volume remain calculated in litres.</span></div><div class="table-wrap"><table><thead><tr><th>Request reference</th><th>Fuel</th><th>Current → proposed</th><th>Status</th><th>Decision maker</th></tr></thead><tbody>${priceRequests}</tbody></table></div></section>
        <section class="panel no-pad u-2b583d73"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Meter readings by nozzle</span></div><div class="toolbar-right"><label for="reading-date-filter">Business date</label><input id="reading-date-filter" class="filter-date" type="date" value="${esc(readingDate)}" data-change="reading-date"></div></div><div class="table-wrap"><table><thead><tr><th>Business date / shift</th><th>Dispenser / nozzle</th><th>Fuel</th><th>Opening meter</th><th>Closing meter</th><th>Fuel sold</th><th>Price / L</th><th>Sales value</th><th>Collections recorded</th><th>Entered by</th></tr></thead><tbody>${rows}</tbody></table></div></section>
        <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Dispenser & nozzle register</h2><p class="panel-subtitle">Prices follow the Manager’s approved price levels; each nozzle is mapped to its receiving tank.</p></div><span class="badge green">${state.nozzles.filter(n=>n.active).length} active nozzles</span></div><div class="tank-list">${nozzleCards}</div></section>`;
    }

    function renderDepositsPage() {
      const summary=depositStatus(depositDateFilter),m=dailyMetrics(depositDateFilter);
      const rows=sortRecords(state.deposits.filter(d=>d.businessDate===depositDateFilter)).map(d=>{
        const canEdit=isSupervisor()&&d.workflow===DEPOSIT_WORKFLOW&&d.status==='Pending manager approval';
        return `<tr><td><strong>${esc(d.id)}</strong><span class="table-muted">${dateShort(d.businessDate)} · business date</span>${d.workflow==='legacy-cash'?`<span class="table-muted">${esc(d.legacyReason||'Previous cash-only policy')}</span>`:''}</td><td>${dateShort(d.depositDate)}${d.depositTime?`<span class="table-muted">${esc(d.depositTime)}${d.late?' · late':''}</span>`:''}</td><td><strong>${money(d.amount)}</strong><span class="table-muted">Target ${money(m.sales)}</span></td><td>${esc(d.bank)}<span class="table-muted">${esc(d.branch||'Branch not specified')}</span></td><td><span class="table-ref">${esc(d.receipt)}</span><span class="table-muted">${esc(d.method||'—')}</span>${d.slipName?`<span class="table-muted">Slip: ${esc(d.slipName)}</span>`:''}</td><td>${badge(d.status,d.workflow==='legacy-cash'?'gray':undefined)}${depositStageTrack(d)}</td><td><strong>${esc(d.createdBy)}</strong><span class="table-muted">Entered ${timeShort(d.createdAt)}</span>${d.updatedBy?`<span class="table-muted">Updated by ${esc(d.updatedBy)}</span>`:''}${canEdit?`<button type="button" class="btn btn-small btn-outline deposit-edit-button" data-action="edit-deposit" data-id="${esc(d.id)}">Update bank details</button>`:''}</td></tr>`;
      }).join('')||`<tr><td class="table-empty" colspan="7">No deposit records for ${dateShort(depositDateFilter)}.</td></tr>`;
      const methodRows=PAYMENT_KEYS.map(key=>`<div class="payment-line"><span class="payment-swatch"></span><span>${PAYMENT_LABELS[key]}</span><strong>${money(m.payments[key])}</strong></div>`).join('');
      const depositWindowOpen=new Date()>=new Date(`${shiftDate(depositDateFilter,1)}T00:00:00`);
      const canSubmit=isSupervisor()&&summary.closed&&depositWindowOpen&&m.sales>0&&summary.toBank>0.005;
      const pendingForDate=isSupervisor()?state.deposits.find(d=>d.businessDate===depositDateFilter&&d.workflow===DEPOSIT_WORKFLOW&&d.status==='Pending manager approval'):null;
      const actions=canSubmit?`<button class="btn btn-primary" data-action="open-modal" data-modal="deposit">${icon('plus',15)} ${summary.submitted>0.005?'Record next deposit':'Enter bank deposit details'}</button>`:pendingForDate?`<button class="btn btn-primary" data-action="edit-deposit" data-id="${esc(pendingForDate.id)}">${icon('receipt',15)} Enter / update bank details</button>`:isSupervisor()&&summary.hasPending?`<span class="permission-lock">${icon('clock',13)}Awaiting Manager approval</span>`:isSupervisor()&&summary.hasApproved?badge('Approved','green'):isSupervisor()&&m.sales<=0?badge('No sales to bank','gray'):isSupervisor()&&!depositWindowOpen?`<span class="permission-lock">${icon('clock',13)}Deposit entry opens tomorrow</span>`:`<span class="permission-lock">${icon('eye',13)}Manager review only</span>`;
      const dueCopy=summary.closed?`Bank by 10:00 am on ${dateShort(summary.deadlineDate)} · station local time`:'Business closes at 9:00 pm; the bank target finalizes at close.';
      const approvalMessage=summary.fullyBanked?`${money(summary.banked)} approved — fully banked.`:summary.hasPending?`${money(summary.pendingAmount)} awaiting Manager approval${summary.banked>0?` · ${money(summary.banked)} approved`:''}${summary.toBank>0.005?` · ${money(summary.toBank)} still to bank`:''}.`:summary.hasApproved?`${money(summary.banked)} approved · ${money(summary.toBank)} still to bank.`:summary.hasRejected?`A prior submission was rejected. Submit a corrected deposit.`:'No deposit has been submitted for approval.';
      return `${pageHead('Bank deposit reconciliation', 'After the 9:00 pm close, bank the full value of that day’s litres sold by 10:00 am the next morning. Enter the receipt details for Manager approval.', actions)}
        <section class="panel u-2b583d73"><div class="panel-head"><div><h2 class="panel-title">Full-sales banking target · ${esc(dateShort(depositDateFilter))}</h2><p class="panel-subtitle">Target is total meter sales value (litres sold × each reading’s saved selling price), regardless of tender type. ${dueCopy}</p></div><div class="toolbar-right"><label for="deposit-date-filter" class="field-label">Business date</label><input id="deposit-date-filter" class="filter-date" type="date" value="${esc(depositDateFilter)}" data-change="deposit-date"></div></div><div class="stats-grid u-11696618">${statCard('Required deposit',money(summary.due),`<span>${num(m.litres,1)} L sold · full meter-sales value</span>`,'money')}${statCard('Awaiting approval',money(summary.pendingAmount),`<span>${summary.pendingCount?`${summary.pendingCount} deposit${summary.pendingCount===1?'':'s'} · Manager review pending`:'No pending submission'}</span>`,'receipt')}${statCard('Approved / banked',money(summary.banked),`<span>${summary.approvedCount?`${summary.approvedCount} deposit${summary.approvedCount===1?'':'s'} confirmed`:'Not yet approved'}</span>`,'bank')}${statCard('Outstanding',money(summary.outstanding),`<span>${summary.toBank>0.005?`${money(summary.toBank)} still to bank · `:''}${esc(summary.status)}</span>`,'alert')}</div></section>
        <div class="content-grid equal"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Recorded payment mix</h2><p class="panel-subtitle">Tender reconciliation is separate; it does not reduce the full-sales bank target.</p></div></div><div class="payment-list">${methodRows}</div><div class="u-99e4a6e3"><span>Recorded tender total</span><strong class="u-7891572d">${money(m.collectionTotal)}</strong></div></section>
          <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Deadline & approval status</h2><p class="panel-subtitle">${dueCopy}</p></div>${badge(summary.status,summary.tone)}</div><div class="u-aea8546b"><span>Submitted / approved</span><strong>${money(summary.submitted)} / ${money(summary.due)}</strong></div><div class="progress-track"><span class="width-${Math.round(summary.due>0?Math.max(0,Math.min(100,summary.submitted/summary.due*100)):0)}"></span></div><div class="callout u-1b0f4999">${icon('shield',15)}<span><strong>${esc(approvalMessage)}</strong> Deposits can be recorded in stages: each approved slip reduces the outstanding balance until the full meter-sales value is banked. The total can never exceed the sales value, and a duplicate bank and receipt reference is blocked.</span></div></section></div>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Deposit records</span></div><div class="toolbar-right"><span class="permission-lock">${icon('receipt',13)}Receipts and approval decisions are audit logged</span></div></div><div class="table-wrap"><table><thead><tr><th>Record / business date</th><th>Banked date / time</th><th>Amount / target</th><th>Bank / branch</th><th>Receipt / method</th><th>Status</th><th>Entered by / action</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }

    function stationApprovalItems(entry){
      const data=entry&&entry.data||{},items=[];
      (Array.isArray(data.deliveries)?data.deliveries:[]).filter(row=>row.status==='pending').forEach(record=>items.push({kind:'delivery',record}));
      (Array.isArray(data.meterRequests)?data.meterRequests:[]).filter(row=>row.status==='pending').forEach(record=>items.push({kind:'meter',record}));
      (Array.isArray(data.priceRequests)?data.priceRequests:[]).filter(row=>row.status==='pending').forEach(record=>items.push({kind:'price',record}));
      (Array.isArray(data.deposits)?data.deposits:[]).filter(row=>row.workflow===DEPOSIT_WORKFLOW&&row.status==='Pending manager approval').forEach(record=>items.push({kind:'deposit',record}));
      (Array.isArray(data.discrepancies)?data.discrepancies:[]).filter(row=>row.status==='Open').forEach(record=>items.push({kind:'discrepancy',record}));
      return items.sort((a,b)=>new Date(b.record.createdAt||b.record.at||0)-new Date(a.record.createdAt||a.record.at||0));
    }
    function stationApprovalItemMarkup(entry,item){
      const data=entry&&entry.data||{},r=item.record,siteId=esc(entry.id),station=esc(entry.name),id=esc(r.id),submitted=`${esc(r.createdBy||'System')} · ${relativeTime(r.createdAt||r.at||Date.now())}`;
      const globalAction=(kind,label,decision='')=>`<button type="button" class="btn btn-small ${decision==='reject'?'btn-danger':'btn-primary'}" data-action="manager-global-review" data-station-id="${siteId}" data-kind="${kind}" data-id="${id}" ${decision?`data-decision="${decision}"`:''}>${label}</button>`;
      if(item.kind==='delivery')return `<div class="alert-item global-approval-item"><span class="alert-icon warning">${icon('truck',15)}</span><div><strong>Delivery · ${id} · ${esc(r.supplier||'Supplier')} · ${esc(r.fuelType||'Fuel')}</strong><p>${num(r.statedQty,0)} L stated · ${esc(r.tankId||'Tank')} · ${esc(r.driver||'')} · ${esc(r.vehicle||'')}<br>Submitted by ${submitted}</p><div class="global-approval-actions">${globalAction('delivery','Approve','approve')}${globalAction('delivery','Reject','reject')}</div></div><span class="global-approval-site-tag">${station}</span></div>`;
      if(item.kind==='meter')return `<div class="alert-item global-approval-item"><span class="alert-icon info">${icon('meter',15)}</span><div><strong>Meter change · ${id} · ${esc(r.nozzleId||'Nozzle')}</strong><p>${esc(r.adjustmentType||'Adjustment')} · ${num(r.previousReading,1)} → ${num(r.newReading,1)} L · ${esc(r.reason||'No reason entered')}<br>Submitted by ${submitted}</p><div class="global-approval-actions">${globalAction('meter','Authorize','approve')}${globalAction('meter','Reject','reject')}</div></div><span class="global-approval-site-tag">${station}</span></div>`;
      if(item.kind==='price')return `<div class="alert-item global-approval-item"><span class="alert-icon warning">${icon('money',15)}</span><div><strong>Price request · ${id} · ${esc(r.fuelType||'Fuel')}</strong><p>${money(r.currentPrice)}/L → ${money(r.proposedPrice)}/L · ${esc(r.reason||'No reason entered')}<br>Submitted by ${submitted}</p><div class="global-approval-actions">${globalAction('price','Approve globally','approve')}${globalAction('price','Reject','reject')}</div></div><span class="global-approval-site-tag">${station}</span></div>`;
      if(item.kind==='deposit'){
        const target=(Array.isArray(data.readings)?data.readings:[]).filter(reading=>reading.businessDate===r.businessDate).reduce((sum,reading)=>sum+Number(reading.salesValue||0),0);
        return `<div class="alert-item global-approval-item"><span class="alert-icon info">${icon('bank',15)}</span><div><strong>Bank deposit · ${id} · ${dateShort(r.businessDate)} · ${money(r.amount)}</strong><p>Target ${money(target)} · ${esc(r.bank||'Bank')}${r.branch?` · ${esc(r.branch)}`:''} · receipt ${esc(r.receipt||'—')}<br>Submitted by ${submitted}${r.late?' · LATE':''}${r.slipName?` · slip ${esc(r.slipName)}`:''}</p><div class="global-approval-actions">${globalAction('deposit','Approve','approve')}${globalAction('deposit','Reject','reject')}</div></div><span class="global-approval-site-tag">${station}</span></div>`;
      }
      return `<div class="alert-item global-approval-item"><span class="alert-icon warning">${icon('alert',15)}</span><div><strong>Stock / operations review · ${id} · ${esc(r.type||'Discrepancy')}</strong><p>${esc(r.details||r.explanation||'Review the station discrepancy and supporting measurements.')}<br>Reported by ${submitted}</p><div class="global-approval-actions">${globalAction('discrepancy','Review case')}</div></div><span class="global-approval-site-tag">${station}</span></div>`;
    }
    function renderAllStationApprovalsPage(){
      const sites=stationDirectory.stations,queueTotal=allStationReviewQueueCount(),approvalTotals=sites.reduce((sum,entry)=>sum+stationApprovalItems(entry).length,0);
      const globalPrices=stationDirectory.priceLevels||{Petrol:currentFuelPrice('Petrol'),Diesel:currentFuelPrice('Diesel')};
      const siteSections=sites.map(entry=>{
        const items=stationApprovalItems(entry),data=entry.data||{},pumps=Number(entry.pumpCount||0),tanks=Array.isArray(data.tanks)?data.tanks:[],capacity=tanks.reduce((sum,tank)=>sum+Number(tank.capacity||0),0),tolerance=Number(data.station&&data.station.varianceTolerance||0);
        const body=items.map(item=>stationApprovalItemMarkup(entry,item)).join('')||`<div class="global-approval-empty">No approval or discrepancy actions waiting for this station.</div>`;
        return `<section class="panel global-approval-station"><div class="global-approval-station-head"><div><span class="manager-overview-kicker">${entry.id===activeStationId?'CURRENT STATION':'STATION'}</span><h2>${esc(entry.name)}</h2><p>${esc(entry.location||'Location not set')} · ${pumps} pumps · ${capacity.toLocaleString('en-US')} L total underground capacity · ${num(tolerance,0)} L tolerance</p></div><div class="global-approval-site-actions">${badge(`${items.length} item${items.length===1?'':'s'}`,items.length?'amber':'green')}<button type="button" class="btn btn-outline" data-action="switch-station" data-id="${esc(entry.id)}">View station</button></div></div><div class="global-approval-list">${body}</div></section>`;
      }).join('');
      const siteRows=sites.map(entry=>{const data=entry.data||{},items=stationApprovalItems(entry),tanks=Array.isArray(data.tanks)?data.tanks:[],totalCap=tanks.reduce((sum,tank)=>sum+Number(tank.capacity||0),0);return `<tr><td><strong>${esc(entry.name)}</strong><span class="table-muted">${esc(entry.location||'Location not set')}</span></td><td>${Number(entry.pumpCount||0)} · ${Number(entry.pumpCount||0)*2}</td><td>${num(totalCap,0)} L</td><td>${num(data.station&&data.station.varianceTolerance,0)} L</td><td>${badge(`${items.length} waiting`,items.length?'amber':'green')}</td><td><button type="button" class="btn btn-small btn-outline" data-action="switch-station" data-id="${esc(entry.id)}">Open station</button></td></tr>`;}).join('');
      return `${pageHead('All-station Manager review','One Manager queue for delivery, meter, price, deposit and discrepancy decisions across every station workspace.',`<button type="button" class="btn btn-outline" data-page="setup">${icon('wrench',14)} Global & station settings</button>`)}<div class="stats-grid">${statCard('Stations available',String(sites.length),'<span>Manager access across all sites</span>','fuel')}${statCard('Items needing review',String(queueTotal),'<span>All stations · pending approvals and open cases</span>','check')}${statCard('Global Super / Petrol price',`${money(globalPrices.Petrol)}/L`,'<span>Shared rate · future readings</span>','money')}${statCard('Global Diesel price',`${money(globalPrices.Diesel)}/L`,'<span>Shared rate · future readings</span>','money')}</div><section class="panel"><div class="panel-head"><div><h2 class="panel-title">All station workspaces</h2><p class="panel-subtitle">${sites.length} station${sites.length===1?'':'s'} · ${approvalTotals} pending approval or discrepancy item${approvalTotals===1?'':'s'} across all sites.</p></div></div><div class="table-wrap"><table><thead><tr><th>Station / location</th><th>Pumps · nozzles</th><th>Total tank capacity</th><th>Variance tolerance</th><th>Manager queue</th><th>Action</th></tr></thead><tbody>${siteRows}</tbody></table></div></section><div class="global-approval-sites">${siteSections}</div>`;
    }
    function renderApprovalsPage() {
      if(isManager())return renderAllStationApprovalsPage();
      const deliveries = sortRecords(pendingDeliveries());
      const deliveryCards = deliveries.map(d => `<div class="alert-item"><span class="alert-icon warning">${icon('truck',15)}</span><div class="u-59eddc67"><strong>${esc(d.id)} · ${esc(d.supplier)} · ${esc(d.fuelType)}</strong><p>${num(d.statedQty,0)} L stated · Tank ${esc(d.tankId)} · ${esc(d.driver)} (${esc(d.vehicle)})<br>Pre-unload stock ${num(d.preStock,0)} L · note ${esc(d.deliveryNote)} · document ${esc(d.deliveryDocName||'reference only')} · submitted ${relativeTime(d.createdAt)} by ${esc(d.createdBy)}</p><div class="u-e4be7f4b"><button class="btn btn-small btn-primary" data-action="delivery-decision" data-id="${esc(d.id)}" data-decision="approve">${icon('check',12)} Approve</button><button class="btn btn-small btn-danger" data-action="delivery-decision" data-id="${esc(d.id)}" data-decision="reject">Reject</button></div></div></div>`).join('') || `<div class="table-empty">No deliveries are awaiting a decision.</div>`;
      const requests = sortRecords(pendingMeterRequests());
      const meterCards = requests.map(r => `<div class="alert-item"><span class="alert-icon info">${icon('meter',15)}</span><div class="u-59eddc67"><strong>${esc(r.id)} · ${esc(r.nozzleId)} · ${esc(r.adjustmentType)}</strong><p>${dateShort(r.businessDate)} · ${esc(r.shift)} shift · previous ${num(r.previousReading,1)} L → proposed new opening ${num(r.newReading,1)} L<br>${esc(r.reason)} · requested by ${esc(r.createdBy)}</p><div class="u-e4be7f4b"><button class="btn btn-small btn-primary" data-action="meter-decision" data-id="${esc(r.id)}" data-decision="approve">${icon('check',12)} Authorize</button><button class="btn btn-small btn-danger" data-action="meter-decision" data-id="${esc(r.id)}" data-decision="reject">Reject</button></div></div></div>`).join('') || `<div class="table-empty">No meter adjustments are awaiting a decision.</div>`;
      const depositRequests=sortRecords(pendingDepositApprovals());
      const depositCards=depositRequests.map(d=>{const target=dailyMetrics(d.businessDate),stage=depositStatus(d.businessDate);return `<div class="alert-item"><span class="alert-icon info">${icon('bank',15)}</span><div class="u-59eddc67"><strong>${esc(d.id)} · ${dateShort(d.businessDate)} deposit · ${money(d.amount)}</strong><p>Sales ${money(target.sales)} for ${num(target.litres,1)} L · approved so far ${money(stage.banked)} · after this ${money(Math.max(0,stage.due-stage.banked-Number(d.amount)))} outstanding · banked ${dateShort(d.depositDate)} ${esc(d.depositTime||'time not recorded')} · ${esc(d.bank)}${d.branch?` · ${esc(d.branch)}`:''}<br>Receipt ${esc(d.receipt)} · ${esc(d.method)} · submitted by ${esc(d.createdBy)} · ${relativeTime(d.createdAt)}${d.updatedBy?` · updated by ${esc(d.updatedBy)} ${relativeTime(d.updatedAt)}`:''}${d.late?' · LATE':''}${d.slipName?`<br>Slip filename: ${esc(d.slipName)}`:''}${d.correctionReason?`<br>Correction reason: ${esc(d.correctionReason)}`:''}${d.comments?`<br>${esc(d.comments)}`:''}</p><div class="u-e4be7f4b"><button class="btn btn-small btn-primary" data-action="deposit-decision" data-id="${esc(d.id)}" data-decision="approve">${icon('check',12)} Approve deposit</button><button class="btn btn-small btn-danger" data-action="deposit-decision" data-id="${esc(d.id)}" data-decision="reject">Reject</button></div></div></div>`;}).join('')||`<div class="table-empty">No bank deposits are awaiting approval.</div>`;
      const priceRequests=sortRecords(pendingPriceRequests());
      const priceCards=priceRequests.map(r=>`<div class="alert-item"><span class="alert-icon warning">${icon('money',15)}</span><div class="u-59eddc67"><strong>${esc(r.id)} · ${esc(r.fuelType)} price change</strong><p>Current ${money(r.currentPrice)}/L → proposed ${money(r.proposedPrice)}/L<br>${esc(r.reason)} · requested by ${esc(r.createdBy)} · ${relativeTime(r.createdAt)}</p><div class="u-e4be7f4b"><button class="btn btn-small btn-primary" data-action="price-decision" data-id="${esc(r.id)}" data-decision="approve">${icon('check',12)} Approve price</button><button class="btn btn-small btn-danger" data-action="price-decision" data-id="${esc(r.id)}" data-decision="reject">Reject</button></div></div></div>`).join('') || `<div class="table-empty">No fuel-price changes are awaiting approval.</div>`;
      const activePriceCards=['Petrol','Diesel'].map(fuel=>{const last=latestPriceChange(fuel);return `<div class="tank-row"><div class="tank-row-top"><div class="tank-name"><span class="tank-symbol">${icon('money',15)}</span><div><strong>${esc(fuel)} · current approved rate</strong><span>Applies to ${state.nozzles.filter(n=>n.fuel===fuel).length} nozzle(s)${last?` · changed ${dateTime(last.effectiveAt)}`:''}</span></div></div><div class="tank-figures"><strong>${money(currentFuelPrice(fuel))}</strong><span>GHS per litre</span></div></div></div>`;}).join('');
      const history = sortRecords(state.deliveries.filter(d => d.status !== 'pending')).slice(0,8).map(d => `<tr><td><span class="table-ref">${esc(d.id)}</span></td><td>${esc(d.supplier)} · ${esc(d.fuelType)}</td><td>${num(d.statedQty,0)} L note${d.approvedQty==null?'':` · approved ${num(d.approvedQty,1)} L`}${d.actualQty==null?'':` · received ${num(d.actualQty,1)} L`}</td><td>${badge(deliveryStatusText(d))}</td><td>${esc(d.approvalDecision ? d.approvalDecision.approver : '—')}<span class="table-muted">${d.approvalDecision ? dateTime(d.approvalDecision.at) : ''}</span></td><td>${esc(d.approvalDecision ? (d.approvalDecision.comments||'—') : '—')}</td></tr>`).join('') || `<tr><td colspan="6" class="table-empty">No approval decisions yet.</td></tr>`;
      return `${pageHead('Manager approval queue', 'Only the authorized manager can approve deliveries, meter changes, selling-price requests and full-sales deposits.', `<span class="role-pill manager">${icon('shield',12)}Authorized manager</span>`)}
        <div class="callout form-warning u-688de308">${icon('shield',15)}<span><strong>Approval control is active.</strong> Station policy requires manager approval before unloading. The Manager confirms litres and the approved volume is posted to the mapped tank once; the later Supervisor receipt and post-unload dip reconcile the balance. Pending or rejected deliveries never change inventory. Price requests also need a decision before new rates take effect. Full-sales deposits must match the saved meter-sales value exactly and include receipt evidence.</span></div>
        <div class="content-grid equal"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Fuel deliveries</h2><p class="panel-subtitle">${pendingDeliveries().length} waiting for a decision · receipt conditions must be completed after approval.</p></div>${badge(`${pendingDeliveries().length} pending`,pendingDeliveries().length?'amber':'green')}</div><div class="alert-list">${deliveryCards}</div></section><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Meter adjustment requests</h2><p class="panel-subtitle">Reset, rollover, replacement and corrections require an authorized reason.</p></div>${badge(`${pendingMeterRequests().length} pending`,pendingMeterRequests().length?'amber':'green')}</div><div class="alert-list">${meterCards}</div></section></div>
        <section class="panel u-d6f2af6e"><div class="panel-head"><div><h2 class="panel-title">Full-sales bank deposits</h2><p class="panel-subtitle">Verify the exact saved sales-value target, bank date/time, bank details and receipt reference.</p></div>${badge(`${depositRequests.length} pending`,depositRequests.length?'amber':'green')}</div><div class="alert-list">${depositCards}</div></section>
        <div class="content-grid equal"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Fuel price changes</h2><p class="panel-subtitle">Supervisor proposals stay pending until you approve or reject.</p></div>${badge(`${priceRequests.length} pending`,priceRequests.length?'amber':'green')}</div><div class="alert-list">${priceCards}</div></section><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Current approved pump prices</h2><p class="panel-subtitle">New prices apply to future meter readings only.</p></div>${badge('Active rates','green')}</div><div class="tank-list">${activePriceCards}</div></section></div>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Recent delivery decisions</span></div></div><div class="table-wrap"><table><thead><tr><th>Reference</th><th>Supplier / fuel</th><th>Quantity</th><th>Current status</th><th>Decision maker / time</th><th>Comments</th></tr></thead><tbody>${history}</tbody></table></div></section>`;
    }

    function renderDiscrepanciesPage() {
      const list = sortRecords(state.discrepancies.filter(d => discrepancyFilter === 'all' || (discrepancyFilter === 'open' && d.status === 'Open') || (discrepancyFilter === 'resolved' && d.status !== 'Open')));
      const rows = list.map(d => {
        const variance = d.variance != null ? signedLitres(d.variance) : '—';
        const action = d.status === 'Open' ? `<button class="btn btn-small btn-soft" data-action="review-discrepancy" data-id="${esc(d.id)}">Review</button>` : `<span class="table-muted">${esc(d.reviewedBy || d.createdBy || '')}</span>`;
        return `<tr><td><span class="table-ref">${esc(d.id)}</span><span class="table-muted">${dateShort(d.businessDate)}</span></td><td><strong>${esc(d.type)}</strong><span class="table-muted">${esc(d.tankId || d.recordId || '—')}</span></td><td>${esc(d.details || '—')}<span class="table-muted">Reported: ${esc(d.explanation || 'No note')}</span></td><td>${d.expected==null?'—':`${num(d.expected,1)} L`}</td><td>${d.physical==null?'—':`${num(d.physical,1)} L`}</td><td class="${d.variance<0?'text-danger':''}"><strong>${variance}</strong><span class="table-muted">Tolerance ${d.tolerance==null?'—':`${num(d.tolerance,0)} L`}</span></td><td>${badge(d.status)}</td><td>${esc(d.createdBy)}<span class="table-muted">${timeShort(d.createdAt)}</span></td><td>${action}</td></tr>`;
      }).join('') || `<tr><td colspan="9" class="table-empty">No discrepancies in this view.</td></tr>`;
      const high = state.discrepancies.filter(d => d.status==='Open').length;
      const resolved = state.discrepancies.filter(d => d.status!=='Open').length;
      return `${pageHead('Discrepancy review', 'Investigate measured differences. Do not classify variance as theft or loss without evidence; stock adjustments require manager authorization.', `<span class="role-pill manager">${icon('shield',12)}Manager controls</span>`)}
        <div class="stats-grid">${statCard('Open for review',String(high),'<span>Require investigation and comments</span>','alert')}${statCard('Reviewed / resolved',String(resolved),'<span>Prior decisions remain in history</span>','check')}${statCard('Stock adjustments',String(state.adjustments.length),'<span>Authorized records only</span>','tank')}${statCard('Pending meter requests',String(pendingMeterRequests().length),'<span>Approval queue</span>','meter')}</div>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Operational exceptions</span><div class="segmented"><button class="segment ${discrepancyFilter==='open'?'active':''}" data-action="discrepancy-filter" data-filter="open">Open (${high})</button><button class="segment ${discrepancyFilter==='resolved'?'active':''}" data-action="discrepancy-filter" data-filter="resolved">Reviewed (${resolved})</button><button class="segment ${discrepancyFilter==='all'?'active':''}" data-action="discrepancy-filter" data-filter="all">All</button></div></div></div><div class="table-wrap"><table><thead><tr><th>Exception / date</th><th>Type / source</th><th>Details / explanation</th><th>Expected</th><th>Physical</th><th>Variance</th><th>Status</th><th>Reported by</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div></section>
        <div class="callout u-d6f2af6e">${icon('info',15)}<span><strong>Audit protection:</strong> authorized adjustments are appended to the stock calculation and retain the original measurement, revised expected balance, approver and reason. Approved records are not silently overwritten or deleted.</span></div>`;
    }

    function renderReconciliationPage() {
      const m=dailyMetrics(reportDate),depositDay=reportDate,bank=depositStatus(depositDay);
      const nozzleRows=readingsForDate(reportDate).map(r=>{
        const collected=sumPayments(r.payments),diff=Number((r.salesValue-collected).toFixed(2));
        return `<tr><td><strong>${esc(r.dispenserId)} · ${esc(r.nozzleId)}</strong><span class="table-muted">${esc(r.fuelType)} · ${esc(r.shift)} shift</span></td><td>${num(r.litres,1)} L</td><td>${money(r.salesValue)}</td><td>${money(r.payments.cash)}</td><td>${money(r.payments.mobile)}</td><td>${money(r.payments.card)}</td><td>${money(r.payments.credit)}</td><td>${money(r.payments.other)}</td><td class="${Math.abs(diff)>1?'text-danger':''}"><strong>${money(diff)}</strong></td></tr>`;
      }).join('')||`<tr><td colspan="9" class="table-empty">No sales records found for this date.</td></tr>`;
      const deposits=sortRecords(state.deposits.filter(d=>d.businessDate===depositDay)).map(d=>{
        const legacy=d.workflow==='legacy-cash';
        const action=!legacy&&d.status==='Pending manager approval'?`<span class="u-66a83f83"><button class="btn btn-small btn-soft" data-action="deposit-decision" data-id="${esc(d.id)}" data-decision="approve">Approve</button><button class="btn btn-small btn-danger" data-action="deposit-decision" data-id="${esc(d.id)}" data-decision="reject">Reject</button></span>`:esc(d.approvalDecision?.approver||d.approvedBy||'—');
        return `<tr><td><span class="table-ref">${esc(d.id)}</span><span class="table-muted">${legacy?'Legacy cash record':esc(d.createdBy)}</span></td><td>${dateShort(d.depositDate)}<span class="table-muted">${esc(d.depositTime||'Time not recorded')}${d.late?' · late':''}</span></td><td>${money(d.amount)}<span class="table-muted">Target ${money(m.sales)}</span></td><td>${esc(d.bank)} · ${esc(d.receipt)}</td><td>${badge(d.status,legacy?'gray':undefined)}</td><td>${action}</td></tr>`;
      }).join('')||`<tr><td colspan="6" class="table-empty">No deposit record for ${dateShort(depositDay)}.</td></tr>`;
      return `${pageHead('Sales & payment reconciliation', 'Review tender reconciliation and the full-sales bank deposit due by 10:00 am after the 9:00 pm business close.', `<span class="permission-lock">${icon('eye',13)}Manager review</span>`)}
        <section class="panel u-2b583d73"><div class="panel-head"><div><h2 class="panel-title">Daily reconciliation · ${esc(dateShort(reportDate))}</h2><p class="panel-subtitle">Revenue uses saved nozzle litres × selling price. The full sales value—not one tender channel—is due for banking by 10:00 am the next day.</p></div><div class="u-0467e99d"><label for="recon-date" class="field-label">Business date</label><input id="recon-date" class="filter-date" type="date" value="${esc(reportDate)}" data-change="report-date"></div></div><div class="stats-grid u-ef0b7a11">${statCard('Expected sales / bank target',money(m.sales),`<span>${num(m.litres,1)} L × saved nozzle prices</span>`,'money')}${statCard('Recorded collections',money(m.collectionTotal),'<span>Across all tender types</span>','bank')}${statCard('Sales vs collection difference',money(m.collectionDifference),'<span>Unexplained gaps should be reviewed</span>','alert')}${statCard('Deposit not yet approved',money(bank.outstanding),`<span>${money(bank.pendingAmount)} submitted · ${esc(bank.status)} · due ${dateShort(bank.deadlineDate)} 10:00 am</span>`,'receipt')}</div></section>
        <section class="panel no-pad u-2b583d73"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Nozzle-level tender reconciliation</span></div><div class="toolbar-right">${badge('Tender mix stays separate','blue')}</div></div><div class="table-wrap"><table><thead><tr><th>Dispenser / nozzle</th><th>Fuel sold</th><th>Sales value</th><th>Cash</th><th>Mobile money</th><th>Card</th><th>Credit</th><th>Other</th><th>Difference</th></tr></thead><tbody>${nozzleRows}</tbody></table></div></section>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Bank deposit details · ${esc(dateShort(depositDay))}</span></div><div class="toolbar-right"><span class="permission-lock">${icon('shield',13)}Full-sales value must match target</span></div></div><div class="table-wrap"><table><thead><tr><th>Deposit record</th><th>Banked date / time</th><th>Amount / target</th><th>Bank / receipt</th><th>Status</th><th>Manager action / approver</th></tr></thead><tbody>${deposits}</tbody></table></div></section>`;
    }

    function reportDefinition(key, date) {
      const tanks = state.tanks.map(t => tankMetrics(t, date));
      const day = dailyMetrics(date);
      if (key === 'tank-stock') return {
        title: 'Daily underground tank stock report', subtitle: `Expected balances and physical measurements for ${dateLong(date)}.`,
        headers: ['Tank','Fuel','Opening (L)','Approved deliveries (L)','Sales (L)','Adjustments (L)','Expected close (L)','Physical close (L)','Available (L)','Inventory cost value (GHS)','Variance (L)','Status'],
        rows: tanks.map(m => [m.tank.id,m.tank.fuel,num(m.opening,1),num(m.deliveries,1),num(m.litresSold,1),num(m.adjustments,1),num(m.expected,1),num(m.physical,1),num(m.available,1),money(m.inventoryCostValue),signedLitres(m.variance),Math.abs(m.variance)>m.tolerance?'Investigate':'Within tolerance'])
      };
      if (key === 'deliveries') {
        const list = state.deliveries.filter(d => d.businessDate === date);
        return { title:'Fuel delivery & approval report', subtitle:`Tanker activity and approval trail for ${dateLong(date)}.`, headers:['Reference','Supplier','Driver / contact','Vehicle','Delivery note','Supporting file','Fuel / tank','Stated (L)','Received (L)','Status','Approver'], rows:list.map(d=>[d.id,d.supplier,`${d.driver} / ${d.contact}`,d.vehicle,d.deliveryNote,d.deliveryDocName||'—',`${d.fuelType} / ${d.tankId}`,num(d.statedQty,1),d.actualQty==null?'—':num(d.actualQty,1),deliveryStatusText(d),d.approvalDecision?d.approvalDecision.approver:'Pending']) };
      }
      if (key === 'delivery-check') {
        const list = state.deliveries.filter(d => d.businessDate === date);
        return { title:'Pre / post-delivery stock comparison', subtitle:`Receiving tank dip versus quantity received.`, headers:['Reference','Tank','Stock before (L)','Stock after (L)','Measured increase (L)','Received quantity (L)','Difference (L)','Status'], rows:list.map(d=>{const inc=d.postStock==null?null:Number(d.postStock)-Number(d.preStock);const diff=inc==null||d.actualQty==null?null:inc-Number(d.actualQty);return [d.id,d.tankId,num(d.preStock,1),d.postStock==null?'Pending':num(d.postStock,1),inc==null?'Pending':num(inc,1),d.actualQty==null?'Pending':num(d.actualQty,1),diff==null?'Pending':signedLitres(diff),d.receiptStatus||deliveryStatusText(d)];}) };
      }
      if (key === 'meter-readings') return { title:'Daily pump meter reading report', subtitle:`Opening and closing meter readings by nozzle for ${dateLong(date)}.`, headers:['Shift','Dispenser','Nozzle','Fuel','Opening meter','Closing meter','Sold (L)','Price / L','Sales value','Entered by'], rows:readingsForDate(date).map(r=>[r.shift,r.dispenserId,r.nozzleId,r.fuelType,num(r.opening,1),num(r.closing,1),num(r.litres,1),money(r.price),money(r.salesValue),r.createdBy]) };
      if (key === 'dispenser-summary') {
        const p=pumpSummary(date),rows=[];
        p.cards.forEach(card=>card.items.forEach(item=>rows.push([card.dispenser.id+(card.dispenser.active?'':' (inactive)'),item.fuel==='Petrol'?'Super (Petrol)':'Diesel',item.nozzle.id,item.nozzle.tankId,String(item.records),num(item.litres,1),item.prices.length?item.prices.map(price=>`GHS ${price}`).join(' / '):'—',money(item.value),money(item.price),money(item.atCurrent)])));
        ['Petrol','Diesel'].forEach(fuel=>{const t=p.fuelTotals[fuel];rows.push([`${fuel==='Petrol'?'SUPER':'DIESEL'} TOTAL`,fuel==='Petrol'?'Super (Petrol)':'Diesel',`${t.nozzles} active nozzle${t.nozzles===1?'':'s'}`,'—','—',num(t.litres,1),'—',money(t.value),money(p.priceNow[fuel]),money(t.atCurrent)]);});
        rows.push(['STATION TOTAL',`${p.dispenserCount} dispenser${p.dispenserCount===1?'':'s'}`,'—','—','—',num(p.totalLitres,1),'—',money(p.totalValue),'—',money(p.totalAtCurrent)]);
        return { title:'Dispenser summary · Super & Diesel', subtitle:`${p.dispenserCount} dispensers · litres × applicable price for ${dateLong(date)}. Recorded value matches daily sales, reconciliation and banking.`, headers:['Dispenser','Fuel','Nozzle','Tank','Shift records','Litres sold','Applicable price / L','Recorded sales value','Current price / L','Value at current price'], rows };
      }
      if (key === 'nozzle-sales') return { title:'Sales by dispenser and nozzle', subtitle:`Litres and GHS value calculated for ${dateLong(date)}.`, headers:['Dispenser','Nozzle','Tank','Fuel','Shift','Litres sold','Price / L','Sales value'], rows:readingsForDate(date).map(r=>[r.dispenserId,r.nozzleId,r.tankId,r.fuelType,r.shift,num(r.litres,1),money(r.price),money(r.salesValue)]) };
      if (key === 'payment-recon') {
        const rows = PAYMENT_KEYS.map(k=>[PAYMENT_LABELS[k],money(day.payments[k]),'Tender channel only; does not change the full-sales bank target']);
        rows.push(['Total recorded sales value',money(day.sales),'Meter litres × selling price']);
        rows.push(['Total collections recorded',money(day.collectionTotal),'Cash + mobile money + card + credit + other']);
        rows.push(['Sales / collection difference',money(day.collectionDifference),'Investigate if not explained']);
        rows.push(['Full-sales deposit target',money(day.bankDue),'Total meter-sales value due by next-day 10:00 am']);
        return { title:'Daily sales and payment reconciliation', subtitle:`Recorded collections compared with sales value for ${dateLong(date)}.`, headers:['Payment / control','Amount','Treatment'], rows };
      }
      if (key === 'bank-recon') {
        const summary=depositStatus(date); const list=state.deposits.filter(d=>d.businessDate===date);
        const rows=list.map(d=>[d.id,dateShort(d.depositDate),money(d.amount),d.bank,d.branch||'—',d.receipt,d.method,d.status,d.createdBy]);
        rows.push(['FULL-SALES TARGET',dateShort(date),money(summary.due),'—','—','—','Total meter litres × saved selling prices','—','—']);
        rows.push(['SUBMITTED FOR APPROVAL','—',money(summary.pendingAmount),'—','—','—','Awaiting Manager decision','—','—']);
        rows.push(['APPROVED / BANKED','—',money(summary.banked),'—','—','—','Manager approved','—','—']);
        rows.push(['OUTSTANDING','—',money(summary.outstanding),'—','—','—','Target less approved deposits','—','—']);
        return { title:'Bank deposit reconciliation report', subtitle:`Deposit records against the full meter-sales target for ${dateLong(date)}.`, headers:['Record','Deposit date','Amount','Bank','Branch','Receipt','Method','Status','Entered by'], rows };
      }
      if (key === 'variance') return { title:'Stock variance and adjustment report', subtitle:`Physical stock differences and authorized adjustments for ${dateLong(date)}.`, headers:['Tank','Fuel','Expected (L)','Physical (L)','Variance (L)','Tolerance (L)','Control status','Authorized adjustment (L)'], rows:tanks.map(m=>[m.tank.id,m.tank.fuel,num(m.expected,1),num(m.physical,1),signedLitres(m.variance),num(m.tolerance,0),Math.abs(m.variance)>m.tolerance?'Investigate':'Within tolerance',num(m.adjustments,1)]) };
      if (key === 'exceptions') {
        const rows=state.deliveries.filter(d=>d.status==='pending'||d.status==='approved_awaiting_receipt').map(d=>[d.id,'Delivery',deliveryStatusText(d),`${d.supplier} · ${d.fuelType} · ${num(d.statedQty,0)} L`,d.createdBy,dateTime(d.createdAt)]);
        state.discrepancies.filter(d=>d.status==='Open').forEach(d=>rows.push([d.id,d.type,d.status,d.details||d.explanation||'—',d.createdBy,dateTime(d.createdAt)]));
        state.meterRequests.filter(r=>r.status==='pending').forEach(r=>rows.push([r.id,'Meter adjustment',r.status,`${r.nozzleId} · ${r.adjustmentType} · ${r.reason}`,r.createdBy,dateTime(r.createdAt)]));
        return { title:'Outstanding approval and discrepancy report', subtitle:'Items that require manager decision or documented investigation.', headers:['Reference','Type','Status','Details','Raised by','Raised at'], rows };
      }
      if (key === 'performance') {
        const dates = [...new Set(state.readings.map(r=>r.businessDate))].filter(d=>d<=date).sort().slice(-30);
        const rows=dates.map(d=>{const x=dailyMetrics(d);return [dateShort(d),num(x.petrolLitres,1),num(x.dieselLitres,1),num(x.litres,1),money(x.petrolSales),money(x.dieselSales),money(x.sales),money(x.bankDue)];});
        return { title:'Station performance · daily rollup', subtitle:`Available daily readings up to ${dateLong(date)} (weekly / monthly view).`, headers:['Business date','Petrol (L)','Diesel (L)','Total volume (L)','Petrol value','Diesel value','Total sales','Full-sales bank target'], rows };
      }
      return { title:'Daily report', subtitle:dateLong(date), headers:[], rows:[] };
    }
    function renderReportsPage() {
      const def = reportDefinition(selectedReport, reportDate);
      const cards = REPORTS.map(([key,label,ico])=>`<button type="button" class="report-card ${selectedReport===key?'active':''}" data-action="select-report" data-report="${key}">${icon(ico,15)}<strong>${esc(label)}</strong><span>Open report ${icon('chevron',10)}</span></button>`).join('');
      const body = def.rows.length ? def.rows.map(row=>`<tr>${row.map((value,index)=>`<td>${index===0?`<strong>${esc(value)}</strong>`:esc(value)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${def.headers.length || 1}" class="table-empty">No records available for ${dateShort(reportDate)}.</td></tr>`;
      return `${pageHead('Operational reports', 'Choose a report, review the selected date, then export a CSV or print a clean copy.', `<button class="btn btn-outline" data-action="print-report">${icon('print',14)} Print report</button><button class="btn btn-primary" data-action="export-report">${icon('download',14)} Export CSV</button>`)}
        <div class="report-grid">${cards}</div>
        <section class="panel no-pad"><div class="table-toolbar"><div class="report-meta"><div><h2>${esc(def.title)}</h2><p>${esc(def.subtitle)}</p></div></div><div class="toolbar-right"><label for="report-date" class="field-label">Business date</label><input id="report-date" class="filter-date" type="date" value="${esc(reportDate)}" data-change="report-date"></div></div><div class="table-wrap"><table id="report-table"><thead><tr>${def.headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></section>`;
    }

    /* The audit log grows without bound (about 2,000 events per station per year), so the page renders the newest
       AUDIT_PAGE events and loads more on request. The CSV export always contains the complete log. */
    const AUDIT_PAGE=100;let auditLimit=AUDIT_PAGE;
    function renderAuditPage() {
      const sortedAudit=sortRecords(state.audit),shown=Math.min(auditLimit,sortedAudit.length);
      const rows = sortedAudit.slice(0,shown).map(a => `<tr><td>${dateShort(localDateIso(new Date(a.at)))}<span class="table-muted">${timeShort(a.at)}</span></td><td><strong>${esc(a.user)}</strong><span class="table-muted">${esc(a.role)}</span></td><td>${esc(a.action)}</td><td><span class="table-ref">${esc(a.record)}</span></td><td>${esc(a.oldValue)}</td><td><strong>${esc(a.newValue)}</strong></td><td>${esc(a.reason||'—')}</td></tr>`).join('') || `<tr><td colspan="7" class="table-empty">No audit events recorded.</td></tr>`;
      return `${pageHead('Audit trail', 'Each operational record, approval, verification and authorized correction is attributed to a user and timestamp.', `<button class="btn btn-outline" data-action="export-audit">${icon('download',14)} Export audit CSV</button>`)}
        <div class="content-grid three">${statCard('Audit events',String(state.audit.length),'<span>Append-only activity log</span>','history')}${statCard('Active user',esc(currentUser.name),`<span>${isManager()?'Authorized manager':'Supervisor'} account</span>`,'user')}${statCard('Record controls','Enabled','<span>Changes require a reason</span>','shield')}</div>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><span class="panel-title">Chronological activity log</span></div><div class="toolbar-right"><span class="permission-lock">${icon('lock',13)}Approved records are not silently overwritten</span></div></div><div class="table-wrap"><table><thead><tr><th>Date / time</th><th>User / role</th><th>Action</th><th>Record</th><th>Original value</th><th>New value / decision</th><th>Reason / comments</th></tr></thead><tbody>${rows}</tbody></table></div>${sortedAudit.length>AUDIT_PAGE?`<div class="table-more"><span class="table-more-count" role="status" tabindex="-1">Showing the newest ${num(shown,0)} of ${num(sortedAudit.length,0)} events</span>${shown<sortedAudit.length?`<button class="btn btn-outline btn-small" type="button" data-action="audit-more">${icon('history',14)} Show ${num(Math.min(AUDIT_PAGE*2,sortedAudit.length-shown),0)} more</button>`:''}<span class="table-more-note">Export audit CSV for the complete log.</span></div>`:''}</section>`;
    }

    function renderSetupPage() {
      if(!isManager())return '';
      const manager=managerAccount()||{name:'Manager',username:''},supervisors=state.users.filter(user=>user.role==='supervisor');
      const sites=stationDirectory.stations;
      const totalPumps=sites.reduce((sum,entry)=>sum+Number(entry.pumpCount||0),0);
      const assignedPlacements=supervisors.reduce((sum,user)=>sum+assignedStationIds(user).length,0);
      const globalPrices=stationDirectory.priceLevels||{Petrol:currentFuelPrice('Petrol'),Diesel:currentFuelPrice('Diesel')};
      const createAssignments=supervisors.map(user=>`<label class="station-assignment-choice" for="create-station-user-${esc(user.id)}"><input id="create-station-user-${esc(user.id)}" name="supervisorIds" type="checkbox" value="${esc(user.id)}"><span><strong>${esc(user.name)}</strong><small>@${esc(user.username)}</small></span></label>`).join('')||`<p class="station-assignment-empty">Create a Supervisor account first, then assign access from the station cards.</p>`;
      const stationCards=sites.map(entry=>{
        const current=entry.id===activeStationId,assigned=supervisors.filter(user=>assignedStationIds(user).includes(entry.id));
        const checks=supervisors.map(user=>`<label class="station-assignment-choice" for="assign-${esc(entry.id)}-${esc(user.id)}"><input id="assign-${esc(entry.id)}-${esc(user.id)}" name="supervisorIds" type="checkbox" value="${esc(user.id)}" ${assignedStationIds(user).includes(entry.id)?'checked':''}><span><strong>${esc(user.name)}</strong><small>@${esc(user.username)}</small></span></label>`).join('')||`<p class="station-assignment-empty">No Supervisor accounts yet. Create an account above.</p>`;
        const pumps=Number(entry.pumpCount||1),data=entry.data||{},nozzles=Array.isArray(data.nozzles)?data.nozzles:[],siteTanks=Array.isArray(data.tanks)?data.tanks:[];
        const superCapacity=Number(siteTanks.find(tank=>tank.fuel==='Petrol')?.capacity||60000),dieselCapacity=Number(siteTanks.find(tank=>tank.fuel==='Diesel')?.capacity||45000),siteTolerance=Number(data.station&&data.station.varianceTolerance!=null?data.station.varianceTolerance:300),totalCapacity=superCapacity+dieselCapacity;
        const tankConfiguration=`<form class="station-capacity-form" data-station-id="${esc(entry.id)}"><div class="station-capacity-grid"><div class="field"><label for="super-capacity-${esc(entry.id)}">Super / Petrol tank (L)</label><input id="super-capacity-${esc(entry.id)}" name="superCapacity" type="number" min="1000" max="500000" step="100" value="${superCapacity}" required></div><div class="field"><label for="diesel-capacity-${esc(entry.id)}">Diesel tank (L)</label><input id="diesel-capacity-${esc(entry.id)}" name="dieselCapacity" type="number" min="1000" max="500000" step="100" value="${dieselCapacity}" required></div><div class="field"><label for="station-tolerance-${esc(entry.id)}">Variance tolerance (L)</label><input id="station-tolerance-${esc(entry.id)}" name="tolerance" type="number" min="0" max="100000" step="1" value="${siteTolerance}" required></div><div class="field"><label for="super-cost-${esc(entry.id)}">Super purchase cost (GHS/L)</label><input id="super-cost-${esc(entry.id)}" name="superCost" type="number" min="0" max="1000" step="0.01" value="${Number(siteTanks.find(tank=>tank.fuel==='Petrol')?.purchaseCostPerLitre||0).toFixed(2)}"></div><div class="field"><label for="diesel-cost-${esc(entry.id)}">Diesel purchase cost (GHS/L)</label><input id="diesel-cost-${esc(entry.id)}" name="dieselCost" type="number" min="0" max="1000" step="0.01" value="${Number(siteTanks.find(tank=>tank.fuel==='Diesel')?.purchaseCostPerLitre||0).toFixed(2)}"></div></div><div class="station-capacity-total"><span>Combined underground capacity</span><strong data-capacity-total aria-live="polite">${num(totalCapacity,0)} L</strong></div><button class="btn btn-outline" type="submit">Save tank settings</button></form>`;
        const nozzleMap=`<div class="station-nozzle-map"><span class="station-map-label">Every pump has two dedicated nozzles</span><span><strong>Super / Petrol</strong> → T-SUPER</span><span><strong>Diesel</strong> → T-DIESEL</span></div>`;
        const activeLabel=current?'Current station':'Open station';
        return `<article class="station-admin-card ${current?'current':''}">
          <div class="station-admin-head"><div><span class="station-admin-kicker">${esc(entry.id)} · ${current?'ACTIVE CONTEXT':'STATION'}</span><h3>${esc(entry.name)}</h3><p>${esc(entry.location||'Location not set')}</p>${stationSetupReadiness(entry).ready?badge('Operational','green'):badge('Pending Configuration','amber')}</div><button class="btn ${current?'btn-primary':'btn-outline'}" type="button" data-action="switch-station" data-id="${esc(entry.id)}">${activeLabel}</button></div>
          <form class="station-identity-form" data-station-id="${esc(entry.id)}"><div class="form-grid"><div class="field"><label for="station-name-${esc(entry.id)}">Station name *</label><input id="station-name-${esc(entry.id)}" name="name" required maxlength="70" value="${esc(entry.name)}"></div><div class="field"><label for="station-location-${esc(entry.id)}">Location *</label><input id="station-location-${esc(entry.id)}" name="location" required maxlength="100" value="${esc(entry.location||'')}"></div></div><button class="btn btn-outline" type="submit">Save station details</button></form>
          <div class="station-admin-stats"><span><strong>${pumps}</strong> active pumps</span><span><strong>${pumps*2}</strong> active nozzles</span><span><strong>${assigned.length}</strong> Supervisors</span></div>
          ${nozzleMap}
          <p class="station-tank-summary">${icon('tank',15)} <span>${stationTankSummary(entry)}</span></p>
          <form class="station-pump-form" data-station-id="${esc(entry.id)}"><div class="field"><label for="pump-count-${esc(entry.id)}">Number of active pumps</label><input id="pump-count-${esc(entry.id)}" name="pumpCount" type="number" min="1" max="50" step="1" required value="${pumps}"></div><button class="btn btn-outline" type="submit">Save pump count</button></form>
          ${tankConfiguration}
          <form class="station-assignment-form" data-station-id="${esc(entry.id)}"><fieldset><legend>Assign Supervisors to this station</legend><div class="station-assignment-list">${checks}</div></fieldset><button class="btn btn-outline" type="submit">Save Supervisor access</button></form>
        </article>`;
      }).join('');
      const activeDispensers=state.dispensers.filter(dispenser=>dispenser.active).length;
      const dispenserRows=state.dispensers.filter(dispenser=>dispenser.active).map(dispenser=>{
        const pair=state.nozzles.filter(nozzle=>nozzle.dispenser===dispenser.id);
        const superNozzle=pair.find(nozzle=>nozzle.fuel==='Petrol'),dieselNozzle=pair.find(nozzle=>nozzle.fuel==='Diesel');
        return `<tr><td><strong>${esc(dispenser.id)}</strong></td><td>${superNozzle?`${esc(superNozzle.id)} · ${esc(superNozzle.tankId)}`:'Missing'}</td><td>${dieselNozzle?`${esc(dieselNozzle.id)} · ${esc(dieselNozzle.tankId)}`:'Missing'}</td><td>${badge(dispenser.active?'Active':'Inactive',dispenser.active?'green':'gray')}</td></tr>`;
      }).join('')||`<tr><td colspan="4" class="table-empty">No configured pumps are available.</td></tr>`;
      const supervisorRows=supervisors.map(user=>{
        const assignments=assignedStationIds(user).map(id=>stationEntryById(id)).filter(Boolean).map(entry=>esc(entry.name)).join(' · ')||'<span class="table-muted">Unassigned · cannot sign in</span>';
        return `<tr><td><strong>${esc(user.name)}</strong><span class="table-muted">${esc(user.username)}</span></td><td>${assignments}</td><td>${badge('Supervisor','blue')}</td><td>${dateShort(localDateIso(new Date(user.createdAt||Date.now())))}</td><td>${esc(user.createdBy||'—')}</td><td><div class="table-actions"><button type="button" class="btn btn-small btn-outline" data-action="reset-password" data-id="${esc(user.id)}">Reset password</button><button type="button" class="btn btn-small btn-danger" data-action="delete-supervisor" data-id="${esc(user.id)}">Delete access</button></div></td></tr>`;
      }).join('')||`<tr><td colspan="6" class="table-empty">No Supervisor accounts exist. Create one above.</td></tr>`;
      const org=stationDirectory.organization||{};
      return `${pageHead('Stations, pumps & access','Create stations, map each Super and Diesel nozzle to its own physical tank, and assign Supervisor access.')}
        <div class="stats-grid">${statCard('Stations',String(sites.length),'<span>Independent station workspaces</span>','fuel')}${statCard('Active pumps',String(totalPumps),'<span>Manager-configured across all stations</span>','meter')}${statCard('Active nozzles',String(totalPumps*2),'<span>Exactly two per pump</span>','chart')}${statCard('Supervisor assignments',String(assignedPlacements),'<span>Accounts can serve assigned sites only</span>','user')}</div>
        <section class="panel company-profile-panel"><div class="panel-head"><div><h2 class="panel-title">Company profile</h2><p class="panel-subtitle">The organisation identity shown on the sign-in screen, sidebar, reports and every backup envelope. Only the authorized Manager can modify company information.</p></div>${badge('Manager only','blue')}</div><form id="company-profile-form"><div class="global-price-grid"><div class="field"><label for="company-name">Organisation name *</label><input id="company-name" name="name" required maxlength="80" autocomplete="organization" value="${esc(org.name||'')}" placeholder="Company name shown in the workspace"></div><div class="field"><label for="company-tagline">Workspace tagline <span class="optional">(optional)</span></label><input id="company-tagline" name="tagline" maxlength="90" value="${esc(org.tagline||'')}" placeholder="e.g. Energy retail · Accra"></div><div class="field"><label for="company-manager">Authorized Manager account</label><input id="company-manager" class="readonly" readonly value="${esc(manager.name||DEFAULT_MANAGER_NAME)} · @${esc(manager.username||DEFAULT_MANAGER_USERNAME)}"><span class="field-hint">Protected sign-in · auto-configured at initialization · cannot be deleted.</span></div><div class="field global-price-submit"><button class="btn btn-primary" type="submit">Save company information ${icon('check',14)}</button></div></div></form>${org.updatedAt?`<p class="field-hint company-profile-meta">${icon('history',13)} Last updated ${esc(dateTime(org.updatedAt))}${org.updatedBy?` by ${esc(org.updatedBy)}`:''}.</p>`:''}</section>
        <section class="panel global-price-panel"><div class="panel-head"><div><h2 class="panel-title">Global Manager price levels</h2><p class="panel-subtitle">One approved Super / Petrol and Diesel rate applies to every station and all future readings. Historical meter readings keep their saved price.</p></div>${badge('All stations','blue')}</div><form id="global-price-form"><div class="global-price-grid"><div class="field"><label for="global-petrol-price">Super / Petrol price (GHS per litre)</label><input id="global-petrol-price" name="petrolPrice" type="number" min="0.01" max="1000" step="0.01" value="${Number(globalPrices.Petrol).toFixed(2)}" required></div><div class="field"><label for="global-diesel-price">Diesel price (GHS per litre)</label><input id="global-diesel-price" name="dieselPrice" type="number" min="0.01" max="1000" step="0.01" value="${Number(globalPrices.Diesel).toFixed(2)}" required></div><div class="field"><label for="global-price-reason">Price update reason *</label><input id="global-price-reason" name="reason" required maxlength="200" placeholder="e.g. Approved national price adjustment"></div><div class="field global-price-submit"><button class="btn btn-primary" type="submit">Apply prices to every station</button></div></div></form><div class="callout u-56f43562">${icon('info',14)}<span>Applying a global price updates every active and inactive pump nozzle at all stations. Pending same-fuel requests are marked superseded; prior sales remain unchanged.</span></div></section>
        <div class="content-grid equal station-management-forms">
          <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Create a station</h2><p class="panel-subtitle">Each site starts with separate Super / Petrol and Diesel physical tanks and its own pump/nozzle setup.</p></div>${badge('Manager only','blue')}</div>
            <form id="station-create-form"><div class="form-grid"><div class="field"><label for="new-station-name">Station name *</label><input id="new-station-name" name="name" required maxlength="70" placeholder="e.g. Spintex Station"></div><div class="field"><label for="new-station-location">Location *</label><input id="new-station-location" name="location" required maxlength="100" placeholder="e.g. Spintex Road, Accra"></div><div class="field"><label for="new-station-pumps">Number of pumps *</label><input id="new-station-pumps" name="pumpCount" type="number" min="1" max="50" step="1" value="2" required></div></div><fieldset class="station-create-assignments"><legend>Assign existing Supervisors (optional)</legend><div class="station-assignment-list">${createAssignments}</div></fieldset><button class="btn btn-primary" type="submit">Create station and pump setup</button></form>
            <div class="callout u-56f43562">${icon('info',15)}<span>New stations start with zero measured stock. Supervisors can record physical dips and approved deliveries to build each tank’s available balance.</span></div>
          </section>
          <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Create Supervisor account</h2><p class="panel-subtitle">New accounts are assigned to the current station; you can grant access to more stations below.</p></div>${badge('Manager only','blue')}</div>
            <form id="supervisor-form"><div class="form-grid"><div class="field span-2"><label for="supervisor-name">Full name *</label><input id="supervisor-name" name="name" required maxlength="80" autocomplete="name" placeholder="e.g. Abena Owusu"></div><div class="field"><label for="supervisor-username">Username *</label><input id="supervisor-username" name="username" required minlength="3" maxlength="30" pattern="[A-Za-z0-9._\\-]{3,30}" autocomplete="username" placeholder="e.g. abena.owusu"></div><div class="field"><label for="supervisor-password">Temporary password *</label><input id="supervisor-password" name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="10+ characters, letters and numbers"></div><div class="field span-2"><button class="btn btn-primary" type="submit">Create Supervisor</button></div></div></form>
            <div class="form-warning u-56f43562">${icon('shield',14)}<span>Passwords are stored only as salted PBKDF2 hashes in this browser’s local database. This static app cannot provide secure server-side authentication; share credentials carefully.</span></div>
          </section>
        </div>
        <section class="panel station-directory-panel"><div class="panel-head"><div><h2 class="panel-title">Station directory & access</h2><p class="panel-subtitle">Assign one or more Supervisors per station. Unassigned accounts cannot sign in; station records stay separate.</p></div>${badge(`${sites.length} station${sites.length===1?'':'s'}`,'blue')}</div><div class="station-admin-grid">${stationCards}</div></section>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><div><h2 class="panel-title">Current station nozzle map · ${esc(state.station.name)}</h2><p class="panel-subtitle">${activeDispensers} pumps · every pump has one Super nozzle to T-SUPER and one Diesel nozzle to T-DIESEL.</p></div></div><div class="toolbar-right">${badge('Manager only','blue')}</div></div><div class="table-wrap"><table><thead><tr><th>Pump</th><th>Super / Petrol nozzle → physical tank</th><th>Diesel nozzle → physical tank</th><th>Status</th></tr></thead><tbody>${dispenserRows}</tbody></table></div></section>
        <section class="panel no-pad"><div class="table-toolbar"><div class="toolbar-left"><div><h2 class="panel-title">Supervisor accounts</h2><p class="panel-subtitle">A Supervisor can work only in stations assigned by the Manager. Historical records remain attributed if access changes.</p></div></div><div class="toolbar-right">${badge(`${supervisors.length} account${supervisors.length===1?'':'s'}`,'green')}</div></div><div class="table-wrap"><table><thead><tr><th>Name / username</th><th>Assigned stations</th><th>Role</th><th>Created</th><th>Created by</th><th>Action</th></tr></thead><tbody><tr><td><strong>${esc(manager.name)}</strong><span class="table-muted">${esc(manager.username)} · protected login</span></td><td>All stations · Manager</td><td>${badge('Authorized Manager','blue')}</td><td>Built-in</td><td>System</td><td><span class="permission-lock">${icon('lock',12)}Cannot delete</span></td></tr>${supervisorRows}</tbody></table></div></section>`;
    }

    function automaticPersistencePanelMarkup(){
      const ok=autosaveRuntime.indexedDB&&!autosaveRuntime.lastError,mode=bootRestorePending?'Opening database…':autosaveRuntime.indexedDB?(autosaveRuntime.lastError?'Save error':'IndexedDB · saving'):'Not saving';
      const ratio=autosaveRuntime.quota?autosaveRuntime.usage/autosaveRuntime.quota:0,pct=Math.round(ratio*100);
      const retentionOptions=RETENTION_CHOICES.map(value=>`<option value="${value}" ${Number(storageSettings.retention)===value?'selected':''}>Keep latest ${value}</option>`).join('');
      const intervalOptions=INTERVAL_CHOICES.map(value=>`<option value="${value}" ${Number(storageSettings.intervalMinutes)===value?'selected':''}>Every ${value} min of activity</option>`).join('');
      return `<section class="panel automatic-persistence-panel"><div class="panel-head"><div><h2 class="panel-title">Local database & recovery points</h2><p class="panel-subtitle">Every change is written immediately to this browser's IndexedDB in one atomic transaction. Checksum-verified recovery points are kept on a rolling schedule and before every restore or import.</p></div>${badge(mode,ok?'green':'red')}</div>
        <div class="autosave-status-grid"><div><span>Last saved</span><strong>${esc(autosaveRuntime.lastSavedAt?`${dateTime(autosaveRuntime.lastSavedAt)} · rev ${autosaveRuntime.revision}`:'Waiting for first save')}</strong></div><div><span>Recovery points</span><strong>${num(autosaveRuntime.backupCount||0,0)} stored · keep ${esc(storageSettings.retention)}</strong></div><div><span>Latest recovery point</span><strong>${esc(autosaveRuntime.lastSnapshotAt?dateTime(autosaveRuntime.lastSnapshotAt):'None yet')}</strong></div><div><span>Browser storage</span><strong>${autosaveRuntime.quota?`${formatBytes(autosaveRuntime.usage)} of ${formatBytes(autosaveRuntime.quota)}`:'Estimate unavailable'} · ${autosaveRuntime.storagePersistent===true?'persistent':autosaveRuntime.storagePersistent===false?'may be evicted':'checking'}</strong>${autosaveRuntime.quota?`<div class="storage-meter ${pct>=80?'is-high':''}" role="img" aria-label="${pct}% of browser storage used"><span class="width-${Math.min(100,Math.max(1,pct))}"></span></div>`:''}</div></div>
        ${autosaveRuntime.lastWarning?`<div class="callout form-warning">${icon('alert',15)}<span>${esc(autosaveRuntime.lastWarning)}</span></div>`:''}
        <form id="retention-form" class="retention-form"><div class="field"><label for="retention-select">Retention</label><select id="retention-select" name="retention">${retentionOptions}</select></div><div class="field"><label for="interval-select">Automatic recovery point</label><select id="interval-select" name="interval">${intervalOptions}</select></div><button type="submit" class="btn btn-outline">Save settings</button></form>
        <div class="global-approval-actions"><button type="button" class="btn btn-primary" data-action="manage-auto-backups">${icon('history',14)} View / restore recovery points</button><button type="button" class="btn btn-outline" data-action="create-recovery-point">${icon('shield',14)} Create recovery point now</button>${autosaveRuntime.lastError?`<button type="button" class="btn btn-outline" data-action="retry-autosave">${icon('refresh',14)} Retry save</button>`:''}</div></section>
        <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Full workspace backup (off-device)</h2><p class="panel-subtitle">A timestamped JSON file with every station, record, ID, setting, the transaction ledger and the Supervisor directory (salted password hashes only). Store it on another device, a USB drive or approved cloud storage.</p></div>${badge('Manager only','blue')}</div>
        <div class="alert-list"><div class="alert-item"><span class="alert-icon success">${icon('download',15)}</span><div><strong>Download full backup</strong><p>${autosaveRuntime.lastExportAt?`Last downloaded ${esc(dateTime(autosaveRuntime.lastExportAt))}.`:'Not downloaded yet in this browser.'} Recovery points stay on this device; only a file stored elsewhere protects against device loss.</p><button type="button" data-action="export-full-backup">Download full backup JSON</button></div></div><div class="alert-item"><span class="alert-icon info">${icon('file',15)}</span><div><strong>Restore a full backup</strong><p>The file's SHA-256 checksum and structure are validated and previewed first. A safety recovery point is saved before anything is replaced.</p><button type="button" data-action="load-backup">Choose backup file ${icon('chevron',11)}</button></div></div></div>
        <details class="limits-disclosure"><summary>${icon('info',14)} Storage limitations of this static app</summary><ul><li>Records live in this browser on this device only — there is no cross-device sync or shared multi-user database.</li><li>Clearing site data, private windows, uninstalling the browser or browser storage eviction deletes them.</li><li>Recovery points are on the same device and do not protect against device loss or failure.</li><li>Roles and approvals are enforced in the browser only and are not secure against a determined user; secure approvals need a server.</li><li>Nothing runs while the app is closed; automatic off-device backup needs a backend service.</li></ul></details></section>`;
    }
    function renderDataManagementPage() {
      const counts={readings:state.readings.length,deliveries:state.deliveries.length,deposits:state.deposits.length,dips:state.stockReadings.length,discrepancies:state.discrepancies.length,audit:state.audit.length,prices:state.priceRequests.length+state.priceHistory.length};
      const total=counts.readings+counts.deliveries+counts.deposits+counts.dips+counts.discrepancies+counts.prices;
      const pending=pendingDeliveries().length+pendingMeterRequests().length+pendingPriceRequests().length+pendingDepositApprovals().length;
      return `${pageHead('Data management', 'Manager-only controls for backing up, restoring, clearing or reseeding the active station.', `<button class="btn btn-outline" data-action="load-backup">${icon('file',14)} Load backup file</button><button class="btn btn-primary" data-action="export-full-backup">${icon('download',14)} Full backup</button>`)}
        <input id="backup-file" class="hidden" type="file" accept="application/json,.json">
        <div class="stats-grid">${statCard('Operational records',String(total),'<span>Readings, dips, deliveries, deposits and approvals</span>','clipboard')}${statCard('Pending approvals',String(pending),'<span>Deliveries, meter, price and deposit requests</span>','check')}${statCard('Audit events',String(counts.audit),'<span>Included in exported backups</span>','history')}${statCard('Shared roles','All levels','<span>Changes apply to supervisor and manager views</span>','user')}</div>
        ${automaticPersistencePanelMarkup()}
        <div class="content-grid equal"><section class="panel"><div class="panel-head"><div><h2 class="panel-title">Back up or restore station data</h2><p class="panel-subtitle">JSON backup captures the active station’s tank/pump setup, prices, operational records and audit events. It excludes account credentials; the shared Supervisor directory and assignments are left untouched on restore.</p></div>${badge('Manager only','blue')}</div><div class="alert-list"><div class="alert-item"><span class="alert-icon success">${icon('download',15)}</span><div><strong>Download this station’s backup</strong><p>Save a portable copy before clearing or replacing records.</p><button type="button" data-action="export-backup">Download backup JSON</button></div></div><div class="alert-item"><span class="alert-icon info">${icon('file',15)}</span><div><strong>Load a previous backup</strong><p>Restore a valid station backup. It replaces only the active station’s records; other station data and Supervisor assignments remain.</p><button type="button" data-action="load-backup">Choose backup file ${icon('chevron',11)}</button></div></div></div></section>
          <section class="panel"><div class="panel-head"><div><h2 class="panel-title">Start fresh</h2><p class="panel-subtitle">Remove this station’s activity when starting over. Download a backup first.</p></div>${badge('Active station only','blue')}</div><div class="alert-list"><div class="alert-item"><span class="alert-icon warning">${icon('alert',15)}</span><div><strong>Clear this station’s records</strong><p>Remove this station’s transactions, approvals and audit history. Its tank/pump setup, shared Supervisor accounts and current approved prices are retained.</p><button type="button" data-action="clear-station-data">Clear records and start empty ${icon('chevron',11)}</button></div></div></div></section></div>
        <div class="callout">${icon('shield',15)}<span><strong>Station-level control.</strong> Clear and restore apply only to ${esc(state.station.name)}. Other stations and the shared Supervisor directory remain unchanged. Backups are downloaded to your device; they are not sent to a server.</span></div>`;
    }

    function renderModal() {
      if (!modal || !currentUser) return '';
      const heading = modalHeading(modal.type,modal);
      const body = modalBody(modal);
      const small = ['delivery-decision','meter-decision','price-decision','review-discrepancy','deposit-decision','data-reset','backup-load-confirm','delete-supervisor','change-password','reset-password','auto-backups','auto-backup-confirm','full-backup-confirm','storage-status'].includes(modal.type) ? 'small' : '';
      return `<div class="modal-backdrop ${animFlags.modal?'anim-enter':''}" data-action="backdrop-close"><section class="modal ${small} ${modal.type==='banking-alert'?'modal-alert':''}" role="${modal.type==='banking-alert'?'alertdialog':'dialog'}" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><div><h2 id="modal-title">${heading[0]}</h2><p>${heading[1]}</p></div><button type="button" class="modal-close" aria-label="Close" data-action="close-modal">${icon('close',16)}</button></div>${body}</section></div>`;
    }
    function modalHeading(type,data={}) {
      if(type==='data-reset')return ['Clear this station’s records','This removes operational records for the active station only; all other station workspaces and assignments remain.'];
      if(type==='backup-load-confirm')return ['Load station backup','The selected backup will replace records for the active station only.'];
      if(type==='auto-backups')return ['Recovery points','Checksum-verified versions stored in this browser.'];
      if(type==='auto-backup-confirm')return ['Restore a recovery point','The full workspace will be restored from the selected version.'];
      if(type==='full-backup-confirm')return ['Restore full backup','Validated backup preview — confirm to replace the full workspace.'];
      if(type==='banking-alert')return ['Previous-day sales not banked','Banking confirmation required to complete reconciliation.'];
      if(type==='storage-status')return ['Save status & storage','Where your records are saved and how to protect them.'];
      if(type==='delete-supervisor')return ['Remove Supervisor access','Future sign-in will be disabled; saved station history remains.'];
      if(type==='change-password')return ['Change my password','Confirm your current password, then choose a new one.'];
      if(type==='reset-password')return ['Reset Supervisor password','Set a temporary password and share it with the Supervisor in person.'];
      if(type==='deposit-edit')return ['Update bank deposit details','Correct a pending submission before Manager review. The change and reason are added to the audit trail.'];
      const heads = {
        delivery:['Register incoming tanker','Create a traceable delivery record for manager approval.'],
        'complete-receipt':['Complete delivery receipt','Record actual quantity and post-unload tank measurement.'],
        reading:['Enter pump meter readings','The opening reading is auto-filled from the previous closing meter.'],
        'stock-reading':['Record physical tank dip','Save a measured stock value separately from expected stock.'],
        deposit:['Submit bank deposit for approval','Record the full sales value banked after the 9:00 pm close.'],
        maintenance:['Report dispenser maintenance','Log a nozzle or dispenser issue for station follow-up.'],
        'meter-request':['Request meter adjustment','Manager authorization is required before any meter baseline changes.'],
        'price-request':['Request selling price change','A proposed rate is not active until the authorized manager approves it.'],
        'delivery-decision':['Review delivery request','The decision, approver, timestamp and comments will be retained.'],
        'meter-decision':['Review meter adjustment','Authorize only a documented reset, rollover, replacement or correction.'],
        'price-decision':['Review price change request','The current pump rate remains in force until you approve this request.'],
        'review-discrepancy':['Review stock discrepancy','Choose review-only or authorize a documented stock adjustment.'],
        'deposit-decision':['Review bank deposit','Approve or reject the Supervisor’s deposit submission.']
      };
      return heads[type] || ['Station record','Complete the required fields.'];
    }
    function modalBody(m) {
      switch (m.type) {
        case 'delivery': return deliveryFormMarkup();
        case 'complete-receipt': return receiptFormMarkup(m.id);
        case 'reading': return readingFormMarkup();
        case 'stock-reading': return stockReadingFormMarkup();
        case 'deposit': return depositFormMarkup();
        case 'deposit-edit': return depositFormMarkup(m.id);
        case 'maintenance': return maintenanceFormMarkup();
        case 'meter-request': return meterRequestFormMarkup();
        case 'price-request': return priceRequestFormMarkup();
        case 'price-decision': return priceDecisionMarkup(m.id,m.decision);
        case 'delivery-decision': return deliveryDecisionMarkup(m.id, m.decision);
        case 'meter-decision': return meterDecisionMarkup(m.id, m.decision);
        case 'review-discrepancy': return discrepancyFormMarkup(m.id);
        case 'deposit-decision': return depositDecisionMarkup(m.id,m.decision);
        case 'data-reset': return dataResetMarkup(m.mode);
        case 'delete-supervisor': return deleteSupervisorMarkup(m.id);
        case 'change-password': return changePasswordMarkup();
        case 'reset-password': return resetPasswordMarkup(m.id);
        case 'backup-load-confirm': return backupLoadConfirmMarkup(m);
        case 'auto-backups': return automaticBackupsMarkup();
        case 'auto-backup-confirm': return automaticBackupRestoreConfirmMarkup(m.backupId);
        case 'full-backup-confirm': return fullBackupConfirmMarkup(m);
        case 'storage-status': return storageStatusMarkup();
        case 'banking-alert': return bankingAlertMarkup();
        default: return '';
      }
    }
    function dataResetMarkup() {
      return `<form id="data-reset-form" data-mode="empty"><div class="modal-body"><div class="callout form-warning">${icon('alert',15)}<span><strong>Clear operational records and start empty?</strong> Readings, deliveries, deposits, requests, discrepancies and prior audit entries will be removed. The two-tank setup, dispenser count, Supervisor accounts and current approved prices will remain.</span></div><label class="check-row"><input type="checkbox" name="confirm" required><span><strong>I understand this affects this station</strong><span>Only this station’s operational records are changed. Other stations and Supervisor assignments remain. This cannot be undone unless you have a backup.</span></span></label></div>${modalFooter('Cancel','Clear this station’s records','danger')}</form>`;
    }
    function changePasswordMarkup() {
      return `<form id="change-password-form" autocomplete="off"><div class="modal-body"><input type="text" name="username" value="${esc(currentUser.username)}" autocomplete="username" class="sr-only" tabindex="-1" aria-hidden="true" readonly><div class="form-grid"><div class="field span-2"><label for="cp-current">Current password *</label><input id="cp-current" name="current" type="password" required autocomplete="current-password" placeholder="Current password"></div><div class="field"><label for="cp-new">New password *</label><input id="cp-new" name="next" type="password" required minlength="10" autocomplete="new-password" placeholder="10+ characters"><span class="field-hint">${PASSWORD_RULE}</span></div><div class="field"><label for="cp-confirm">Confirm new password *</label><input id="cp-confirm" name="confirm" type="password" required minlength="10" autocomplete="new-password" placeholder="Repeat the new password"></div></div></div>${modalFooter('Cancel','Change password')}</form>`;
    }
    function resetPasswordMarkup(id) {
      const account=state.users.find(user=>user.id===id&&user.role==='supervisor');
      if(!account)return `<div class="modal-body"><p>Supervisor account not found.</p></div>`;
      return `<form id="reset-password-form" data-id="${esc(account.id)}" autocomplete="off"><div class="modal-body"><div class="callout">${icon('user',15)}<span><strong>${esc(account.name)}</strong> · @${esc(account.username)}</span></div><div class="form-grid"><div class="field"><label for="rp-new">Temporary password *</label><input id="rp-new" name="next" type="password" required minlength="10" autocomplete="new-password" placeholder="10+ characters"><span class="field-hint">${PASSWORD_RULE}</span></div><div class="field"><label for="rp-confirm">Confirm *</label><input id="rp-confirm" name="confirm" type="password" required minlength="10" autocomplete="new-password" placeholder="Repeat the password"></div></div><p class="field-hint">Ask the Supervisor to change it from the lock button beside their name after signing in.</p></div>${modalFooter('Cancel','Reset password')}</form>`;
    }
    async function changeOwnPassword(form) {
      if(!currentUser)return;
      const busySubmit=form.querySelector('button[type="submit"]');if(busySubmit){busySubmit.disabled=true;busySubmit.setAttribute('aria-busy','true');}
      const fd=new FormData(form),current=String(fd.get('current')||''),next=String(fd.get('next')||''),confirmValue=String(fd.get('confirm')||'');
      if(currentUser.authProvider==='supabase') {
        const problem=passwordProblem(next);if(problem)return notify('New password is too weak',problem,true);
        if(next!==confirmValue)return notify('Passwords do not match','Type the same new password twice.',true);
        if(next===current)return notify('Choose a different password','The new password must differ from the current one.',true);
        try {
          await window.SupabaseClient.signInUsername(currentUser.username,current);
          await window.SupabaseClient.changePassword(next);
          await window.SupabaseClient.markPasswordChanged();
          cloudPasswordChangeRequired=false;currentUser.mustChangePassword=false;modal=null;render();notify('Cloud password updated','Your Supabase password has been changed.');
        } catch(error) { notify('Password change failed',String(error&&error.message||error),true); }
        return;
      }
      const account=currentUser.role==='manager'?managerAccount():state.users.find(user=>user.id===currentUser.id);
      if(!account)return notify('Account not found','Sign out and sign in again.',true);
      if(!await verifyPassword(account,current))return notify('Current password is incorrect','Your password was not changed.',true);
      const problem=passwordProblem(next);if(problem)return notify('New password is too weak',problem,true);
      if(next!==confirmValue)return notify('Passwords do not match','Type the same new password twice.',true);
      if(next===current)return notify('Choose a different password','The new password must differ from the current one.',true);
      Object.assign(account,await createPasswordRecord(next));delete account.password;
      const wasDefault=Boolean(account.mustChangePassword);delete account.mustChangePassword;
      addAudit('Password changed',account.username,'—',wasDefault?'Default password replaced by the account holder':'Password updated by the account holder','Stored only as a PBKDF2 hash; the password is not written to the audit trail.');
      saveState();modal=null;render();notify(wasDefault?'Workspace secured':'Password changed',wasDefault?`Your own password is now active. Next, review the company profile and station setup under Stations & pumps.`:'Use the new password next time you sign in.');
    }
    async function resetSupervisorPassword(form) {
      if(!isManager())return notify('Permission denied','Only the Manager can reset Supervisor passwords.',true);
      const account=state.users.find(user=>user.id===form.dataset.id&&user.role==='supervisor');
      if(!account)return notify('Supervisor not found','The account may have been removed.',true);
      const busySubmit=form.querySelector('button[type="submit"]');if(busySubmit){busySubmit.disabled=true;busySubmit.setAttribute('aria-busy','true');}
      const fd=new FormData(form),next=String(fd.get('next')||''),confirmValue=String(fd.get('confirm')||'');
      const problem=passwordProblem(next);if(problem)return notify('Temporary password is too weak',problem,true);
      if(next!==confirmValue)return notify('Passwords do not match','Type the same temporary password twice.',true);
      Object.assign(account,await createPasswordRecord(next));delete account.password;
      addAudit('Supervisor password reset',account.username,'—','Temporary password set by the Manager','Stored only as a PBKDF2 hash; the password is not written to the audit trail.');
      saveState();modal=null;render();notify('Password reset',`Give ${account.name} the temporary password in person and ask them to change it after signing in.`);
    }
    function deleteSupervisorMarkup(id) {
      const account=state.users.find(user=>user.id===id);
      if(!account||account.role!=='supervisor')return `<div class="modal-body">Supervisor account not found.</div>`;
      return `<form id="delete-supervisor-form" data-id="${esc(id)}"><div class="modal-body"><div class="callout form-warning">${icon('alert',15)}<span><strong>Remove ${esc(account.name)} (${esc(account.username)})?</strong> This disables the account’s future sign-in. Existing pump readings, transactions and audit history are not deleted.</span></div><label class="check-row u-06381aa0"><input type="checkbox" name="confirm" required><span><strong>I understand this removes Supervisor access</strong><span>The Authorized Manager login is protected and cannot be deleted here.</span></span></label></div>${modalFooter('Cancel','Remove access','danger')}</form>`;
    }
    function backupLoadConfirmMarkup(m) {
      if(!m.importedState)return `<div class="modal-body">No valid backup is available to load.</div>`;
      const data=m.importedState;
      return `<form id="backup-import-form"><div class="modal-body"><div class="callout form-warning">${icon('file',15)}<span><strong>Backup file:</strong> ${esc(m.fileName||'Station backup')}<br>Contains ${data.tanks.length} tanks, ${data.nozzles.length} nozzles, ${data.readings.length} pump readings, ${data.deliveries.length} deliveries, ${data.deposits.length} deposits and ${(data.audit||[]).length} audit events.${m.sourceSchema===1||m.sourceSchema===2?`<br><strong>Schema ${m.sourceSchema} backup:</strong> tank/nozzle setup will be migrated to Super 60,000 L and Diesel 45,000 L tanks; historical activity is retained.`:''}</span></div><label class="check-row"><input type="checkbox" name="confirm" required><span><strong>Replace this station’s records</strong><span>This backup will be loaded into the active station. Account credentials, assignments and other station workspaces remain unchanged.</span></span></label></div>${modalFooter('Cancel','Load backup','danger')}</form>`;
    }
    function modalFooter(cancelText = 'Cancel', submitText = 'Save record', submitTone = 'primary') {
      return `<div class="modal-footer"><button type="button" class="btn btn-outline" data-action="close-modal">${cancelText}</button><button type="submit" class="btn ${submitTone==='danger'?'btn-danger':'btn-primary'}">${submitText} ${icon(submitTone==='danger'?'alert':'check',14)}</button></div>`;
    }
    function tankOptions(selected = '') {
      return state.tanks.map(t=>`<option value="${esc(t.id)}" ${selected===t.id?'selected':''}>${esc(t.id)} · ${esc(t.fuel)} (${esc(t.name)})</option>`).join('');
    }
    function nozzleOptions(selected = '') {
      return state.nozzles.filter(n=>n.active).map(n=>`<option value="${esc(n.id)}" ${selected===n.id?'selected':''}>${esc(n.dispenser)} · ${esc(n.label)} · ${esc(n.fuel)} (${esc(n.id)})</option>`).join('');
    }
    function deliveryFormMarkup() {
      const firstTank = state.tanks[0];
      return `<form id="delivery-form"><div class="modal-body"><div class="modal-section-title">Tanker & documentation</div><div class="form-grid">
        <div class="field"><label for="del-driver">Driver full name *</label><input id="del-driver" name="driver" required placeholder="e.g. Kwame Ofori"></div>
        <div class="field"><label for="del-contact">Driver contact number *</label><input id="del-contact" name="contact" required type="tel" placeholder="024 000 0000"></div>
        <div class="field"><label for="del-vehicle">Vehicle registration *</label><input id="del-vehicle" name="vehicle" required placeholder="GR 0000-24"></div>
        <div class="field"><label for="del-supplier">Supplier *</label><input id="del-supplier" name="supplier" required placeholder="Supplier name"></div>
        <div class="field"><label for="del-note">Delivery note number *</label><input id="del-note" name="deliveryNote" required placeholder="Supplier note reference"></div>
        <div class="field"><label for="del-doc">Delivery note / supporting file <span class="optional">(optional)</span></label><input id="del-doc" name="deliveryDoc" type="file" accept="image/*,.pdf"></div>
        <div class="field"><label for="del-date">Business date *</label><input id="del-date" name="businessDate" type="date" value="${esc(TODAY)}" required></div>
        <div class="field"><label for="del-fuel">Fuel type *</label><select id="del-fuel" name="fuelType" required><option>Petrol</option><option>Diesel</option></select></div>
        <div class="field"><label for="del-tank">Receiving tank *</label><select id="del-tank" name="tankId" required>${tankOptions(firstTank.id)}</select></div>
        <div class="field span-2"><label for="del-stated">Quantity on delivery note (litres) *</label><input id="del-stated" name="statedQty" type="number" min="0.1" step="0.1" required placeholder="0.0"></div>
      </div><hr class="form-divider"><div class="modal-section-title">Control 1 · record stock before unloading</div><div class="form-grid"><div class="field"><label for="del-predip">Pre-delivery tank dip (cm) *</label><input id="del-predip" name="preDipReading" type="number" min="0" step="0.1" required placeholder="Dip-stick reading"><span class="field-help">Record the dip-stick reading. Volume is recorded separately; no calibration chart is configured.</span></div><div class="field"><label for="del-prestock">Pre-delivery tank volume (L) *</label><input id="del-prestock" name="preStock" type="number" min="0" step="0.1" value="${num(firstTank.physicalStock,1).replace(/,/g,'')}" required><span class="field-help">Record the volume corresponding to the pre-unload dip.</span></div><div class="field span-2"><label>Approval workflow</label><input class="readonly" value="Manager approval before unloading" readonly><span class="field-help">The approved volume is posted once; the post-unload dip later reconciles the balance.</span></div></div>
        <label class="check-row"><input type="checkbox" name="emergency" id="del-emergency"><span><strong>Exceptional handling — already unloaded</strong><span>Use only if documented station policy permits an emergency receipt. Manager authorization and an explanation are required.</span></span></label>
        <div id="emergency-fields" class="hidden"><div class="form-warning">${icon('alert',14)}<span>Exceptional receipt requires quantity received, post-delivery dip, authorizing person/reference and a reason. It remains pending manager approval.</span></div><div class="form-grid"><div class="field"><label for="del-actual">Quantity actually received (L) *</label><input id="del-actual" name="actualQty" type="number" min="0.1" step="0.1" placeholder="0.0"></div><div class="field"><label for="del-postdip">Post-delivery tank dip (cm) *</label><input id="del-postdip" name="postDipReading" type="number" min="0" step="0.1" placeholder="Dip-stick reading"></div><div class="field"><label for="del-poststock">Post-delivery tank volume (L) *</label><input id="del-poststock" name="postStock" type="number" min="0" step="0.1" placeholder="0.0"></div><div class="field"><label for="del-auth">Exception authorization reference *</label><input id="del-auth" name="exceptionAuthority" placeholder="Manager / authorization ref"></div><div class="field"><label for="del-reason">Exception reason *</label><input id="del-reason" name="exceptionReason" placeholder="Explain why unloading proceeded"></div></div></div>
        <div class="form-warning">${icon('info',14)}<span><strong>Delivery records cannot be silently deleted.</strong> A unique reference will be assigned on submission. The manager records the approval decision and comments.</span></div></div>${modalFooter('Cancel','Submit for manager approval') }</form>`;
    }
    function receiptFormMarkup(id) {
      const d = state.deliveries.find(x=>x.id===id);
      if (!d) return `<div class="modal-body">Delivery not found.</div>`;
      return `<form id="receipt-form" data-id="${esc(id)}"><div class="modal-body"><div class="callout form-success u-1a8c3416">${icon('checkcircle',15)}<span><strong>${esc(d.id)} approved for unloading.</strong> The approved volume has already been posted once. Record actual receipt and the post-unload dip/volume to reconcile the tank balance.</span></div><div class="form-grid"><div class="field"><label>Delivery details</label><input class="readonly" readonly value="${esc(d.supplier)} · ${esc(d.fuelType)} · ${num(d.statedQty,0)} L on note"></div><div class="field"><label>Approved volume</label><input class="readonly" readonly value="${num(d.approvedQty ?? d.actualQty ?? d.statedQty,1)} L · ${esc(d.tankId)}"></div><div class="field"><label>Pre-delivery dip / volume</label><input class="readonly" readonly value="${d.preDipReading==null?'Dip not recorded':`${num(d.preDipReading,1)} cm`} · ${num(d.preStock,1)} L"></div><div class="field"><label for="rec-actual">Quantity actually received (L) *</label><input id="rec-actual" name="actualQty" type="number" min="0.1" step="0.1" required placeholder="0.0"></div><div class="field"><label for="rec-postdip">Post-delivery tank dip (cm) *</label><input id="rec-postdip" name="postDipReading" type="number" min="0" step="0.1" required placeholder="Dip-stick reading"></div><div class="field"><label for="rec-post">Post-delivery tank volume (L) *</label><input id="rec-post" name="postStock" type="number" min="0" step="0.1" required placeholder="0.0"></div><div class="field span-2"><label for="rec-note">Receipt remarks <span class="optional">(required if values differ)</span></label><input id="rec-note" name="remarks" placeholder="Explain any difference or note seal condition"></div></div><div class="form-warning">${icon('info',14)}<span>Measured increase = post-delivery volume − pre-delivery volume. Differences from the approved volume beyond ${num(tankById(d.tankId)?.tolerance||200,0)} L are flagged. Dip readings are retained as entered; equivalent dip/volume conversion requires tank calibration data, which is not configured in this demo.</span></div></div>${modalFooter('Cancel','Complete receipt')}</form>`;
    }
    function readingFormMarkup() {
      const nozzle = state.nozzles.find(n=>n.active);
      const open = openingFor(nozzle.id, TODAY, 'Late');
      return `<form id="reading-form"><div class="modal-body"><div class="form-grid"><div class="field"><label for="rd-date">Business date *</label><input id="rd-date" name="businessDate" type="date" value="${esc(TODAY)}" required></div><div class="field"><label for="rd-shift">Shift *</label><select id="rd-shift" name="shift"><option>Day</option><option selected>Late</option><option>Night</option></select></div><div class="field"><label for="rd-nozzle">Dispenser / nozzle *</label><select id="rd-nozzle" name="nozzleId">${nozzleOptions(nozzle.id)}</select></div><div class="field"><label for="rd-fuel">Fuel type</label><input id="rd-fuel" class="readonly" value="${esc(nozzle.fuel)}" readonly></div><div class="field"><label for="rd-opening">Opening meter reading (L)</label><input id="rd-opening" name="opening" class="readonly" readonly value="${num(open,1)}"><span class="field-help">Auto-carried from previous closing or authorized baseline.</span></div><div class="field"><label for="rd-closing">Closing meter reading (L) *</label><input id="rd-closing" name="closing" type="number" min="${open}" step="0.1" required placeholder="Enter closing reading"></div><div class="field"><label for="rd-price">Selling price (GHS / L)</label><input id="rd-price" name="price" class="readonly" readonly value="${num(nozzle.price,2)}"></div><div class="field"><label>Dispenser / tank</label><input id="rd-location" class="readonly" readonly value="${esc(nozzle.dispenser)} · ${esc(nozzle.tankId)}"></div></div>
        <div class="calc-strip"><div class="calc-cell"><span>Fuel sold</span><strong id="preview-litres">0.0 L</strong></div><div class="calc-cell"><span>Sales value</span><strong id="preview-sales">GHS 0.00</strong></div><div class="calc-cell"><span>Collections entered</span><strong id="preview-collections">GHS 0.00</strong></div></div>
        <div class="modal-section-title">Payment breakdown · Ghana cedis</div><div class="payment-fields">${PAYMENT_KEYS.map(k=>`<div class="field"><label for="rd-pay-${k}">${PAYMENT_LABELS[k]}</label><input id="rd-pay-${k}" name="pay_${k}" type="number" min="0" step="0.01" value="0.00"></div>`).join('')}</div>
        <div id="reading-gap-warning" class="form-warning hidden">${icon('alert',14)}<span>Collections differ from calculated sales value. Add a remark explaining the discrepancy before saving.</span></div>
        <div class="field"><label for="rd-remarks">Remarks <span class="optional">(required for unusual readings or collection differences)</span></label><textarea id="rd-remarks" name="remarks" placeholder="Meter notes, adjustments or explanation of any difference"></textarea></div>
        <div class="form-warning">${icon('shield',14)}<span>Negative meter differences are blocked. A reset, rollover or replacement cannot be entered here; request an authorized meter adjustment instead.</span></div></div>${modalFooter('Cancel','Save shift reading')}</form>`;
    }
    function stockReadingFormMarkup() {
      const tank = state.tanks[0];
      const metric = tankMetrics(tank,TODAY);
      return `<form id="stock-reading-form"><div class="modal-body"><div class="form-grid"><div class="field"><label for="dip-date">Business date *</label><input id="dip-date" name="businessDate" type="date" value="${esc(TODAY)}" required></div><div class="field"><label for="dip-tank">Underground tank *</label><select id="dip-tank" name="tankId">${tankOptions(tank.id)}</select></div><div class="field"><label for="dip-stage">Reading stage *</label><select id="dip-stage" name="measurementType"><option>Opening stock</option><option selected>Closing stock</option></select><span class="field-help">Opening readings feed the expected-stock formula; closing readings are compared against it.</span></div><div class="field"><label for="dip-method">Measurement method *</label><select id="dip-method" name="method"><option>Manual tank dip</option><option>Approved tank-gauging system</option></select></div><div class="field"><label>Expected closing stock</label><input id="dip-expected" class="readonly" readonly value="${num(metric.expected,1)} L"></div><div class="field"><label for="dip-physical">Measured physical stock (L) *</label><input id="dip-physical" name="physical" type="number" min="0" step="0.1" required placeholder="0.0"></div><div class="field"><label>Configured tolerance</label><input id="dip-tolerance" class="readonly" readonly value="${num(tank.tolerance,0)} L"></div><div class="field span-2"><label for="dip-remarks">Explanation / remarks <span class="optional">(required when outside tolerance)</span></label><textarea id="dip-remarks" name="remarks" placeholder="Describe measurement conditions or investigation notes"></textarea></div></div><div id="dip-variance-preview" class="callout">${icon('info',15)}<span>Variance will be shown here as you enter the physical reading.</span></div><div class="form-warning">${icon('shield',14)}<span>A physical reading never silently adjusts expected stock. A variance beyond tolerance is routed to manager review; only an authorized adjustment changes the calculation.</span></div></div>${modalFooter('Cancel','Save physical reading')}</form>`;
    }
    function depositFormMarkup(editId='') {
      const existing=editId?state.deposits.find(d=>d.id===editId):null;
      if(editId&&(!isSupervisor()||!existing||existing.workflow!==DEPOSIT_WORKFLOW||existing.status!=='Pending manager approval'))return `<div class="modal-body"><div class="callout form-warning">${icon('alert',15)}<span>This deposit can no longer be changed. Only pending submissions can be edited by a Supervisor.</span></div></div>`;
      const businessDate=existing?existing.businessDate:(depositDateFilter||activeDepositBusinessDate());
      const metrics=dailyMetrics(businessDate);
      const dueDate=shiftDate(businessDate,1);
      const now=new Date(),deadline=depositDeadlineAt(businessDate);
      const alreadyLate=now.getTime()>deadline.getTime()||!!(existing&&existing.late);
      const methods=['Cash deposit','Bank transfer','Cheque','Mobile money settlement'];
      const methodOptions=methods.map(method=>`<option ${existing&&existing.method===method?'selected':''}>${method}</option>`).join('');
      const fileHelp=existing&&existing.slipName?`Receipt attached: ${esc(existing.slipName)}. Upload a replacement if correcting evidence.`:'Required: take a photo of the bank receipt or choose an image from this device (JPG, PNG or WebP; max 8 MB).';
      return `<form id="deposit-form" ${existing?`data-edit-id="${esc(existing.id)}"`:''}><div class="modal-body"><div class="form-grid"><div class="field"><label for="dep-business-date">Business date covered</label><input id="dep-business-date" name="businessDate" type="date" class="readonly" value="${esc(businessDate)}" readonly required><span class="field-help">${existing?'The business date and full-sales target are locked while this submission is pending.':'Select the business date on the deposits page before opening this form.'}</span></div><div class="field"><label for="dep-date">Date banked *</label><input id="dep-date" name="depositDate" type="date" value="${esc(existing?existing.depositDate:dueDate)}" required></div><div class="field"><label for="dep-time">Time banked *</label><input id="dep-time" name="depositTime" type="time" value="${esc(existing?existing.depositTime:'')}" required><span class="field-help">Bank by 10:00 am the morning after the 9:00 pm close.</span></div><div class="field"><label for="dep-amount">${existing?'Amount banked (GHS)':'Amount banked on this slip (GHS) *'}</label><input id="dep-amount" name="amount" type="number" min="0.01" step="0.01" ${existing?`class="readonly" value="${Number(existing.amount).toFixed(2)}" readonly`:`max="${Math.max(0,depositStatus(businessDate).toBank).toFixed(2)}" value="${Math.max(0,depositStatus(businessDate).toBank).toFixed(2)}"`} required><span class="field-help">${existing?'The amount is locked while pending; ask the Manager to reject it if it is wrong.':`Still to bank: ${money(depositStatus(businessDate).toBank)} of ${money(metrics.sales)}. Record each bank slip separately when banking in stages.`}</span></div><div class="field"><label for="dep-method">Deposit method *</label><select id="dep-method" name="method" required>${methodOptions}</select></div><div class="field"><label for="dep-bank">Bank name *</label><input id="dep-bank" name="bank" value="${esc(existing?existing.bank:'')}" required placeholder="e.g. GCB Bank"></div><div class="field"><label for="dep-branch">Branch <span class="optional">(if applicable)</span></label><input id="dep-branch" name="branch" value="${esc(existing?existing.branch:'')}" placeholder="Branch name"></div><div class="field"><label for="dep-receipt">Receipt / transaction reference *</label><input id="dep-receipt" name="receipt" value="${esc(existing?existing.receipt:'')}" required placeholder="Unique bank receipt number"></div><div class="field span-2"><label for="dep-slip">Bank receipt photograph *</label><input id="dep-slip" name="slip" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" ${existing?'':'required'}><span class="field-help">${fileHelp}</span></div><div class="field span-2"><label for="dep-comments">Late deposit / entry explanation <span class="optional">(required if after 10:00 am)</span></label><textarea id="dep-comments" name="comments" ${alreadyLate?'required':''} placeholder="Explain the delay and record any relevant reference">${esc(existing?existing.comments||'':'')}</textarea></div>${existing?`<div class="field span-2"><label for="dep-edit-reason">Reason for updating these details *</label><textarea id="dep-edit-reason" name="editReason" required placeholder="Explain what is being corrected before Manager review"></textarea></div>`:''}</div><div class="callout ${existing?'':'form-warning'}">${icon(existing?'info':'shield',15)}<span><strong>${num(metrics.litres,1)} L sold · target ${money(metrics.sales)}.</strong> The amount remains locked to the full meter-sales value. ${existing?'Manager review is still required; this correction and its reason will be audit logged.':'The deposit must equal the total saved meter-sales value exactly; the Manager will approve or reject the receipt details. Tender/payment type does not change this target.'}${existing&&Math.abs(Number(existing.amount)-metrics.sales)>0.005?` The submitted amount ${money(existing.amount)} no longer matches the current target; a Manager must reject it before a new deposit can be submitted.`:''}${alreadyLate?' The deadline has passed; enter a late explanation.':''}</span></div></div>${modalFooter('Cancel',existing?'Save updated bank details':'Submit for Manager approval')}</form>`;
    }
    function maintenanceFormMarkup() {
      const n=state.nozzles[0];
      return `<form id="maintenance-form"><div class="modal-body"><div class="form-grid"><div class="field"><label for="mnt-nozzle">Dispenser / nozzle *</label><select id="mnt-nozzle" name="nozzleId">${nozzleOptions(n.id)}</select></div><div class="field"><label for="mnt-priority">Priority *</label><select id="mnt-priority" name="priority"><option>Routine</option><option>Planned</option><option>Urgent</option></select></div><div class="field span-2"><label for="mnt-issue">Issue or service request *</label><input id="mnt-issue" name="issue" required placeholder="Describe what needs inspection"></div><div class="field span-2"><label for="mnt-note">Details / remarks</label><textarea id="mnt-note" name="note" placeholder="Observations, meter behavior or safety note"></textarea></div></div><div class="form-warning">${icon('wrench',14)}<span>This creates a maintenance log entry and audit event. Do not continue using equipment that is unsafe.</span></div></div>${modalFooter('Cancel','Submit maintenance flag')}</form>`;
    }
    function meterRequestFormMarkup() {
      const n=state.nozzles[0];
      const prev=openingFor(n.id,TODAY,'Late');
      return `<form id="meter-request-form"><div class="modal-body"><div class="form-grid"><div class="field"><label for="mr-nozzle">Dispenser / nozzle *</label><select id="mr-nozzle" name="nozzleId">${nozzleOptions(n.id)}</select></div><div class="field"><label for="mr-date">Effective business date *</label><input id="mr-date" name="businessDate" type="date" value="${esc(TODAY)}"></div><div class="field"><label for="mr-shift">Effective shift *</label><select id="mr-shift" name="shift"><option>Day</option><option selected>Late</option><option>Night</option></select></div><div class="field"><label for="mr-type">Adjustment type *</label><select id="mr-type" name="adjustmentType"><option>Meter reset</option><option>Meter rollover</option><option>Meter replacement</option><option>Reading correction</option></select></div><div class="field"><label for="mr-previous">Previous closing baseline (L)</label><input id="mr-previous" name="previousReading" class="readonly" readonly value="${num(prev,1)}"></div><div class="field"><label for="mr-new">Proposed new opening reading (L) *</label><input id="mr-new" name="newReading" type="number" min="0" step="0.1" required placeholder="0.0"></div><div class="field span-2"><label for="mr-reason">Reason and supporting detail *</label><textarea id="mr-reason" name="reason" required placeholder="Explain rollover, reset, replacement or correction and any supporting reference"></textarea></div></div><div class="form-warning">${icon('shield',14)}<span>Submitting a request does not change the meter baseline. The manager must approve or reject it; the decision and reason are audit logged.</span></div></div>${modalFooter('Cancel','Request manager authorization')}</form>`;
    }
    function priceRequestFormMarkup() {
      return `<form id="price-request-form"><div class="modal-body"><div class="form-grid"><div class="field"><label for="pr-fuel">Fuel type *</label><select id="pr-fuel" name="fuelType"><option>Petrol</option><option>Diesel</option></select></div><div class="field"><label for="pr-current">Current approved price (GHS / L)</label><input id="pr-current" class="readonly" readonly value="${num(currentFuelPrice('Petrol'),2)}"></div><div class="field span-2"><label for="pr-proposed">Proposed price (GHS / L) *</label><input id="pr-proposed" name="proposedPrice" type="number" min="0.01" step="0.01" required placeholder="0.00"></div><div class="field span-2"><label for="pr-reason">Reason / effective change detail *</label><textarea id="pr-reason" name="reason" required placeholder="For example, supplier price change, approved pricing notice or effective date reference"></textarea></div></div><div class="form-warning">${icon('shield',14)}<span><strong>Approval required.</strong> Submitting only creates a pending request. Current prices stay active until the manager approves; approval takes effect immediately for future pump readings. Saved readings keep the price used at entry.</span></div></div>${modalFooter('Cancel','Submit price for approval')}</form>`;
    }
    function priceDecisionMarkup(id, decision) {
      const request=state.priceRequests.find(row=>row.id===id);
      if(!request)return `<div class="modal-body">Price request not found.</div>`;
      const approving=decision==='approve';
      return `<form id="price-decision-form" data-id="${esc(id)}" data-decision="${decision}"><div class="modal-body"><div class="callout ${approving?'form-success':'form-warning'}">${icon(approving?'checkcircle':'alert',15)}<span><strong>${approving?'Approve price change?':'Reject price change?'}</strong> ${esc(request.fuelType)} will change from ${money(request.currentPrice)}/L to ${money(request.proposedPrice)}/L.</span></div><div class="field u-06381aa0"><label for="price-comments">${approving?'Manager comments':'Reason for rejection'} ${approving?'<span class="optional">(optional)</span>':'*'}</label><textarea id="price-comments" name="comments" ${approving?'':'required'} placeholder="Record pricing notice / decision basis"></textarea></div><div class="form-warning">${icon('info',14)}<span>${esc(request.reason)} · requested by ${esc(request.createdBy)} on ${dateTime(request.createdAt)}. An approval updates future readings only; stock quantities remain in litres.</span></div></div>${modalFooter('Cancel',approving?'Approve new price':'Reject request',approving?'primary':'danger')}</form>`;
    }
    function deliveryDecisionMarkup(id, decision) {
      const d=state.deliveries.find(x=>x.id===id);
      if(!d) return `<div class="modal-body">Delivery record not found.</div>`;
      const approving=decision==='approve';
      return `<form id="delivery-decision-form" data-id="${esc(id)}" data-decision="${decision}"><div class="modal-body"><div class="callout ${approving?'form-success':'form-warning'}">${icon(approving?'checkcircle':'alert',15)}<span><strong>${approving?'Approve delivery and volume?':'Reject this delivery?'}</strong> ${esc(d.id)} · ${esc(d.supplier)} · ${esc(d.fuelType)} · ${num(d.statedQty,0)} L on supplier note for ${esc(d.tankId)}.</span></div><div class="form-grid u-06381aa0"><div class="field"><label>Submitted by</label><input class="readonly" readonly value="${esc(d.createdBy)}"></div><div class="field"><label>Pre-delivery dip / volume</label><input class="readonly" readonly value="${d.preDipReading==null?'Dip not recorded':`${num(d.preDipReading,1)} cm`} · ${num(d.preStock,1)} L"></div>${d.emergency?`<div class="field"><label>Actual receipt / post dip</label><input class="readonly" readonly value="${num(d.actualQty,1)} L · ${d.postDipReading==null?'dip missing':`${num(d.postDipReading,1)} cm`}"></div><div class="field"><label>Post-delivery volume</label><input class="readonly" readonly value="${num(d.postStock,1)} L"></div><div class="field span-2"><label>Exception authority / reason</label><input class="readonly" readonly value="${esc(d.exceptionAuthority)} · ${esc(d.exceptionReason)}"></div>`:''}${approving?`<div class="field"><label for="decision-approved-qty">Volume approved for posting (L) *</label><input id="decision-approved-qty" name="approvedQty" type="number" min="0.1" step="0.1" value="${Number(d.emergency?(d.actualQty||d.statedQty):d.statedQty).toFixed(1)}" required><span class="field-help">This confirmed quantity is added to the receiving tank once, on approval.</span></div><div class="field"><label>Tank capacity</label><input class="readonly" readonly value="${num(tankById(d.tankId)?.capacity||0,0)} L · balance after posting is checked"></div>`:''}<div class="field span-2"><label for="decision-comments">${approving?'Manager comments':'Reason for rejection'} ${approving?'<span class="optional">(required if approved volume differs from source quantity)</span>':'*'}</label><textarea id="decision-comments" name="comments" ${approving?'':'required'} placeholder="Record the basis for the decision${approving?' and explain any quantity difference':''}"></textarea></div></div>${approving?'<div class="form-warning">'+icon('info',14)+'<span>Approval authorizes unloading and immediately posts the manager-approved volume to the selected tank balance. The later receipt dip and actual volume reconcile that posting; no volume is posted twice.</span></div>':''}</div>${modalFooter('Cancel',approving?'Approve delivery & post volume':'Reject delivery',approving?'primary':'danger')}</form>`;
    }
    function meterDecisionMarkup(id, decision) {
      const r=state.meterRequests.find(x=>x.id===id);
      if(!r) return `<div class="modal-body">Adjustment request not found.</div>`;
      const approving=decision==='approve';
      return `<form id="meter-decision-form" data-id="${esc(id)}" data-decision="${decision}"><div class="modal-body"><div class="callout ${approving?'form-success':'form-warning'}">${icon(approving?'checkcircle':'alert',15)}<span><strong>${approving?'Authorize this meter baseline change?':'Reject this meter request?'}</strong> ${esc(r.nozzleId)} · ${esc(r.adjustmentType)} · ${num(r.previousReading,1)} → ${num(r.newReading,1)} L.</span></div><div class="field u-06381aa0"><label for="meter-comments">${approving?'Approval comments':'Reason for rejection'} ${approving?'<span class="optional">(optional)</span>':'*'}</label><textarea id="meter-comments" name="comments" ${approving?'':'required'} placeholder="Record supporting reason / reference"></textarea></div><div class="form-warning">${icon('shield',14)}<span>${esc(r.reason)}</span></div></div>${modalFooter('Cancel',approving?'Authorize baseline':'Reject request',approving?'primary':'danger')}</form>`;
    }
    function discrepancyFormMarkup(id) {
      const d=state.discrepancies.find(x=>x.id===id);
      if(!d) return `<div class="modal-body">Discrepancy not found.</div>`;
      const mayAdjust=d.type==='Stock variance' && d.tankId;
      return `<form id="discrepancy-form" data-id="${esc(id)}"><div class="modal-body"><div class="callout form-warning">${icon('alert',15)}<span><strong>${esc(d.type)} · ${esc(d.tankId||d.recordId||'')}</strong> ${esc(d.details||'Review exception details.')}</span></div><div class="form-grid u-56f43562"><div class="field"><label>Expected / recorded</label><input class="readonly" readonly value="${d.expected==null?'—':`${num(d.expected,1)} L`}"></div><div class="field"><label>Physical / collected</label><input class="readonly" readonly value="${d.physical==null?'—':`${num(d.physical,1)} L`}"></div><div class="field span-2"><label for="disc-action">Manager action *</label><select name="action" id="disc-action"><option value="review">Mark reviewed · no stock adjustment</option>${mayAdjust?'<option value="adjust">Authorize stock adjustment</option>':''}</select></div><div class="field hidden" id="disc-adjust-wrap"><label for="disc-adjust">Authorized adjustment (L) *</label><input name="litres" id="disc-adjust" type="number" step="0.1" value="${d.variance==null?'0':Number(d.variance).toFixed(1)}"></div><div class="field span-2"><label for="disc-comment">Review notes / reason *</label><textarea id="disc-comment" name="comment" required placeholder="Investigation performed, evidence checked and decision basis"></textarea></div></div><div class="form-warning">${icon('shield',14)}<span>Original physical reading is retained. An adjustment is an additional approved transaction, not an edit to the original dip record.</span></div></div>${modalFooter('Cancel','Save manager review')}</form>`;
    }
    function depositDecisionMarkup(id,decision) {
      const d=state.deposits.find(x=>x.id===id);
      if(!d||d.workflow!==DEPOSIT_WORKFLOW)return `<div class="modal-body">Full-sales deposit not found.</div>`;
      const approving=decision==='approve',target=dailyMetrics(d.businessDate);
      const stage=depositStatus(d.businessDate),afterApproval=Number((stage.due-stage.banked-Number(d.amount)).toFixed(2)),matches=afterApproval>=-0.005;
      return `<form id="deposit-decision-form" data-id="${esc(id)}" data-decision="${decision}"><div class="modal-body"><div class="callout ${approving?'form-success':'form-warning'}">${icon(approving?'receipt':'alert',15)}<span><strong>${approving?'Approve this bank deposit?':'Reject this bank deposit?'}</strong> ${esc(d.id)} · sales ${money(target.sales)} for ${num(target.litres,1)} L · already approved ${money(stage.banked)} · this deposit ${money(d.amount)}.</span></div><div class="form-grid u-06381aa0"><div class="field"><label>Banked</label><input class="readonly" readonly value="${dateShort(d.depositDate)} · ${esc(d.depositTime||'Time not recorded')}"></div><div class="field"><label>Bank / branch</label><input class="readonly" readonly value="${esc(d.bank)}${d.branch?` · ${esc(d.branch)}`:''}"></div><div class="field"><label>Receipt / method</label><input class="readonly" readonly value="${esc(d.receipt)} · ${esc(d.method)}"></div><div class="field"><label>Submitted by</label><input class="readonly" readonly value="${esc(d.createdBy)}"></div><div class="field span-2"><label for="deposit-review-comments">${approving?'Manager review comments':'Reason for rejection'} ${approving?'<span class="optional">(optional)</span>':'*'}</label><textarea id="deposit-review-comments" name="comments" ${approving?'':'required'} placeholder="${approving?'Receipt checked against the bank record / slip':'Explain what must be corrected before resubmission'}"></textarea></div></div>${d.receiptImage?`<div class="field span-2"><label>Uploaded bank receipt · ${esc(d.slipName||'receipt image')}</label><a href="${esc(d.receiptImage)}" target="_blank" rel="noopener"><img src="${esc(d.receiptImage)}" alt="Bank receipt evidence for ${esc(d.id)}" style="display:block;max-width:100%;max-height:440px;object-fit:contain;border:1px solid var(--line);border-radius:12px;background:#fff"></a></div>`:`<div class="callout form-warning">Receipt image missing from this legacy record; do not approve without evidence.</div>`}<div class="form-warning">${icon('shield',14)}<span>${matches?(afterApproval<=0.005?'Approving this completes the full meter-sales value.':`After approval ${money(afterApproval)} remains outstanding (staged banking).`):'This amount would exceed the sales value; reject it so the Supervisor can correct it.'} ${d.late?'This deposit was submitted late.':''} ${d.updatedBy?`Updated by ${esc(d.updatedBy)} · ${relativeTime(d.updatedAt)}. `:''}${d.correctionReason?`Correction reason: ${esc(d.correctionReason)}. `:''}${d.slipName?`Slip filename: ${esc(d.slipName)}. `:''}Supervisor comments: ${esc(d.comments||'—')}</span></div></div>${modalFooter('Cancel',approving?'Approve deposit':'Reject deposit',approving?'primary':'danger')}</form>`;
    }

    function renderToast() {
      if (!toast) return '';
      return `<div class="toast ${toast.isError?'error':'success'} ${animFlags.toast?'anim-enter':''}" role="${toast.isError?'alert':'status'}"><span class="toast-icon">${icon(toast.isError?'alert':'checkcircle',17)}</span><div class="toast-body"><strong>${esc(toast.title)}</strong>${toast.detail?`<span>${esc(toast.detail)}</span>`:''}</div><button type="button" class="toast-close" data-action="dismiss-toast" aria-label="Dismiss notification">${icon('close',14)}</button><span class="toast-timer" aria-hidden="true"></span></div>`;
    }
    let clearLoginPassword=false;
    function readLoginDraft(){
      const user=document.getElementById('login-username'),pass=document.getElementById('login-password');
      if(!user||!pass)return null;
      const active=document.activeElement,caret=active===user||active===pass?[active.id,active.selectionStart,active.selectionEnd]:null;
      return {username:user.value,password:pass.value,caret};
    }
    function restoreLoginDraft(draft){
      const user=document.getElementById('login-username'),pass=document.getElementById('login-password');
      if(!user||!pass)return;
      const failed=clearLoginPassword;clearLoginPassword=false;
      if(!user.value)user.value=draft.username;
      if(!pass.value&&!failed)pass.value=draft.password;
      if(draft.caret&&!failed){const el=document.getElementById(draft.caret[0]);if(el){el.focus({preventScroll:true});try{el.setSelectionRange(draft.caret[1],draft.caret[2]);}catch(e){/* not all input types support selection */}}}
      else if(failed)pass.focus({preventScroll:true});
    }
    /* Deferred rendering for background updates. The whole shell re-renders from state, and any
       re-render recreates the DOM — including the native dropdown of an open <select>, which the
       browser then dismisses ("opens and auto-closes on its own"). Timers, toast lifecycles,
       cross-tab refreshes and async status updates therefore render through queueRender(): while
       the user is engaged with a form control the render is queued, then flushed as soon as the
       interaction ends (change / focusout / the 30 s tick). User-initiated actions keep calling
       render() directly and stay instant. */
    let deferredRender=false;
    function interactiveControlEngaged(){
      const el=document.activeElement;
      if(!el||!document.contains(el)||el.disabled||el.readOnly)return false;
      const tag=el.tagName;
      if(tag==='SELECT'||tag==='TEXTAREA')return true;
      // date/time inputs own native pickers, ranges own a drag gesture — a mid-interaction
      // re-render would destroy both, so they count as engaged too.
      return tag==='INPUT'&&!['hidden','file','checkbox','radio','button','submit'].includes(String(el.type).toLowerCase());
    }
    function queueRender(){
      if(interactiveControlEngaged()){deferredRender=true;return;}
      render();
    }
    function flushDeferredRender(){
      if(!deferredRender||interactiveControlEngaged())return;
      deferredRender=false;render();
    }
    function render() {
      deferredRender=false;
      const root=document.getElementById('app');
      if(migrationNotice){toast={title:'Station setup updated',detail:migrationNotice};migrationNotice='';clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast=null;queueRender();},5000);}
      const activeId=document.activeElement&&document.activeElement.id;
      // Keep what the user has typed on the sign-in screen across re-renders (boot completion, toasts, theme switch).
      // Held only in the live DOM for this call — never stored. A failed sign-in clears the password, keeps the username.
      const loginDraft=!currentUser?readLoginDraft():null;
      const entering=animFlags.page, formDrafts=currentUser?captureFormDrafts():[], modalFocus=currentUser&&!animFlags.modal?captureModalFocus():null;
      const setupDraft=!currentUser?readSetupDraft():null;
      if (!currentUser) root.innerHTML=(needsSetup()?renderSetup():renderLogin())+renderToast();
      else root.innerHTML=renderShell();
      if(setupDraft&&!currentUser)restoreSetupDraft(setupDraft);
      document.title=`${orgName()==='Station Operations'?'':`${orgName()} · `}Station Operations`;
      if(loginDraft&&!currentUser)restoreLoginDraft(loginDraft);
      if(currentUser){stampModalKey();restoreFormDrafts(formDrafts);restoreModalFocus(modalFocus);decorateAfterRender(entering);}else{navIndicatorY=null;paletteOpen=false;}
      if(activeId&&!animFlags.modal){const again=document.getElementById(activeId);if(again&&again!==document.activeElement&&!again.closest('.modal'))again.focus({preventScroll:true});}
      animFlags.page=false;animFlags.modal=false;animFlags.popover=false;animFlags.toast=false;animFlags.charts=false;
      lastChartBasis=chartBasis();hideTip();
      if (currentUser && modal && modal.type==='reading') updateReadingPreview();
      if (currentUser && modal && modal.type==='stock-reading') updateStockVariancePreview();
    }

    let loginBusy=false;
    let cloudPasswordChangeRequired=false;
    function stationSetupReadiness(entry){
      const data=entry&&entry.data||{},site=data.station||{},issues=[];
      if(!String(entry&&entry.name||'').trim()||!String(entry&&entry.location||'').trim())issues.push('station name and location');
      if(!(Number(entry&&entry.pumpCount)>0))issues.push('at least one active pump');
      const tanks=Array.isArray(data.tanks)?data.tanks:[];
      ['Petrol','Diesel'].forEach(fuel=>{const tank=tanks.find(row=>row.fuel===fuel);if(!tank||!(Number(tank.capacity)>0))issues.push(`${fuel} tank capacity`);});
      const nozzles=Array.isArray(data.nozzles)?data.nozzles.filter(row=>row.active):[];
      ['Petrol','Diesel'].forEach(fuel=>{if(!nozzles.some(row=>row.fuel===fuel&&Number(row.price)>0))issues.push(`${fuel} selling price`);});
      return {ready:issues.length===0,issues};
    }
    async function login(username,password) {
      if(loginBusy)return;
      const normalized=String(username||'').trim().toLowerCase();
      loginBusy=true;const submit=document.querySelector('#login-form button[type="submit"]');if(submit){submit.disabled=true;submit.setAttribute('aria-busy','true');}
      let account=null;
      try{
        if(!window.SupabaseClient||!window.SupabaseClient.configured())throw new Error('Supabase is not configured. Check js/supabase-config.js.');
        // Cloud mode is authoritative: never fall back to browser-local credentials when cloud auth fails.
        const result=await window.SupabaseClient.signInUsername(normalized,password);
        const profile=result&&result.profile;
        if(!profile||profile.role!=='manager'){
          await window.SupabaseClient.signOut();
          throw new Error('This account is not a Manager account. Supervisor cloud login will be enabled in a later integration stage.');
        }
        cloudPasswordChangeRequired=Boolean(profile.must_change_password);
        account={id:profile.id,role:profile.role,username:normalized,name:profile.full_name||normalized,initials:initialsFor(profile.full_name||normalized),authProvider:'supabase',mustChangePassword:cloudPasswordChangeRequired,regionId:profile.region_id||null};
      }catch(error){
        loginError=String(error&&error.message||'Supabase sign-in failed.');clearLoginPassword=true;loginBusy=false;render();return;
      }finally{loginBusy=false;const button=document.querySelector('#login-form button[type="submit"]');if(button){button.disabled=false;button.removeAttribute('aria-busy');}}
      currentUser=sessionUser(account);
      activePage='dashboard';pendingRoute='';loginError='';modal=null;animFlags.page=true;
      writeRoute(activePage,true);
      try{sessionStorage.removeItem(bankingDismissKey());}catch(e){/* ignore */}
      render();window.scrollTo(0,0);
      if(cloudPasswordChangeRequired){openModal('change-password',{forced:true});notify('Change your temporary password','Set a private password before continuing.',true);}
      else notify('Supabase sign-in successful','Your identity was verified by Supabase. Operational records are still stored in this browser on this device; shared cloud data integration is the next stage.',true);
    }
    function logout() { const cloud=Boolean(currentUser&&currentUser.authProvider==='supabase');try{sessionStorage.removeItem(bankingDismissKey());}catch(e){/* ignore */} currentUser=null;cloudPasswordChangeRequired=false; activePage='dashboard'; modal=null; loginError=''; notificationsOpen=false; drawerOpen=false; try{history.replaceState(null,'',location.pathname+location.search);}catch(e){/* ignore */} animFlags.page=true; render();if(cloud&&window.SupabaseClient)window.SupabaseClient.signOut().catch(()=>{}); }
    function openModal(type, data={}) { notificationsOpen=false; animFlags.modal=true; modal={type,...data}; render(); setTimeout(()=>{ const first=document.querySelector('.modal input:not([readonly]), .modal select, .modal textarea'); if(first) first.focus({preventScroll:true}); },30); }
    let closingModal=false;
    function closeModal() {
      if(modal&&modal.type==='change-password'&&modal.forced&&(defaultManagerPending()||cloudPasswordChangeRequired)){notify('Password change required','The default Manager password must be replaced before the workspace can be used.',true);const first=document.getElementById('cp-current');if(first)first.focus({preventScroll:true});return;}
      const finish=()=>{closingModal=false;modal=null;render();if(externalReloadPending){reloadFromDatabase({quiet:true}).then(()=>notify('Records refreshed','Changes saved in another tab were loaded.'));}};
      const backdrop=document.querySelector('.modal-backdrop');
      if(!backdrop||prefersReducedMotion()){finish();return;}
      if(closingModal)return;closingModal=true;backdrop.classList.add('is-closing');
      let done=false;const once=()=>{if(done)return;done=true;finish();};
      backdrop.addEventListener('animationend',once,{once:true});setTimeout(once,240);
    }

    function updateReadingPreview() {
      const form=document.getElementById('reading-form'); if(!form) return;
      const opening=Number(form.elements.opening.value||0), closing=Number(form.elements.closing.value||opening), price=Number(form.elements.price.value||0);
      const litres=Math.max(0,closing-opening), sales=litres*price;
      const pay=PAYMENT_KEYS.reduce((sum,k)=>sum+Number(form.elements[`pay_${k}`].value||0),0);
      const el=(id)=>document.getElementById(id);
      if(el('preview-litres')) el('preview-litres').textContent=`${num(litres,1)} L`;
      if(el('preview-sales')) el('preview-sales').textContent=money(sales);
      if(el('preview-collections')) el('preview-collections').textContent=money(pay);
      const warning=el('reading-gap-warning');
      if(warning) warning.classList.toggle('hidden',Math.abs(sales-pay)<=1);
    }
    function updateReadingNozzle() {
      const form=document.getElementById('reading-form'); if(!form) return;
      const nozzle=nozzleById(form.elements.nozzleId.value); if(!nozzle)return;
      const date=form.elements.businessDate.value||TODAY, shift=form.elements.shift.value;
      const opening=openingFor(nozzle.id,date,shift);
      form.elements.opening.value=Number(opening).toFixed(1);
      form.elements.closing.min=Number(opening).toFixed(1);
      form.elements.closing.value='';
      form.elements.price.value=Number(nozzle.price).toFixed(2);
      document.getElementById('rd-fuel').value=nozzle.fuel;
      document.getElementById('rd-location').value=`${nozzle.dispenser} · ${nozzle.tankId}`;
      updateReadingPreview();
    }
    function updateStockVariancePreview() {
      const form=document.getElementById('stock-reading-form'); if(!form) return;
      const tank=tankById(form.elements.tankId.value); if(!tank)return;
      const date=form.elements.businessDate.value||TODAY;
      const metric=tankMetrics(tank,date);
      const physical=Number(form.elements.physical.value||0);
      const type=form.elements.measurementType.value;
      const box=document.getElementById('dip-variance-preview');
      document.getElementById('dip-expected').value=`${num(metric.expected,1)} L`;
      document.getElementById('dip-tolerance').value=`${num(metric.tolerance,0)} L`;
      if(type==='Opening stock'){
        if(box)box.innerHTML=`${icon('info',15)}<span>Opening stock will be recorded as <strong>${num(physical,1)} L</strong> and used as the day's opening balance in the expected-stock formula.</span>`;
        return;
      }
      const diff=physical-metric.expected;
      if(box) box.innerHTML=`${icon(Math.abs(diff)>metric.tolerance?'alert':'info',15)}<span>Expected ${num(metric.expected,1)} L · Physical ${num(physical,1)} L · <strong class="${Math.abs(diff)>metric.tolerance?'text-danger':''}">Variance ${signedLitres(diff)}</strong>${Math.abs(diff)>metric.tolerance?' · explanation required':''}</span>`;
    }
    function updateMeterRequestBaseline() {
      const form=document.getElementById('meter-request-form'); if(!form)return;
      form.elements.previousReading.value=Number(openingFor(form.elements.nozzleId.value,form.elements.businessDate.value||TODAY,form.elements.shift.value)).toFixed(1);
    }

    function exportCsv(filename, headers, rows) {
      const csv=[headers,...rows].map(row=>row.map(value=>`"${String(value==null?'':value).replace(/"/g,'""')}"`).join(',')).join('\r\n');
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
    function exportStationBackup() {
      if(!isManager())return notify('Permission denied','Only the Manager can export station backups.',true);
      const backup=stationDataOnly(state);backup.schema=3;
      const stationSlug=String(state.station.name||'station').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'station';
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${fileSlug(orgName())}-${stationSlug}-backup-${TODAY}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
      notify('Station backup downloaded',`The JSON backup includes ${state.station.name} tank/pump setup and operational records. Other station workspaces are not included.`);
    }
    function chooseBackupFile() {
      if(!isManager())return notify('Permission denied','Only the manager can load a station backup.',true);
      const input=document.getElementById('backup-file');if(input)input.click();
    }
    function inspectBackupFile(file) {
      if(!isManager())return notify('Permission denied','Only the manager can load a station backup.',true);
      if(file.size>100*1024*1024)return notify('Backup file is too large','Choose a JSON backup smaller than 100 MB.',true);
      file.text().then(raw=>{
        let parsed;try{parsed=JSON.parse(raw);}catch(e){return notify('Could not read backup','The selected file is not valid JSON.',true);}
        if(parsed&&parsed.format===BACKUP_FORMAT){return validateFullBackup(parsed).then(check=>{if(!check.ok)return notify('Backup rejected',check.error,true);openModal('full-backup-confirm',{fileName:file.name,parsed,checksum:check.checksum});});}
        const normalized=normalizeBackup(parsed);if(!normalized)return notify('Unsupported backup format','Choose a valid station backup JSON file (schema 1, 2 or 3).',true);
        openModal('backup-load-confirm',{fileName:file.name,sourceSchema:parsed.schema,importedState:normalized});
      }).catch(()=>notify('Could not read backup','Check that the selected file is accessible, then try again.',true));
    }
    function importStationBackup(form) {
      if(!isManager())return notify('Permission denied','Only the manager can restore station records.',true);
      if(!modal||modal.type!=='backup-load-confirm')return notify('Backup confirmation expired','Choose the backup file again before restoring.',true);
      const confirmData=new FormData(form);if(confirmData.get('confirm')!=='on')return notify('Confirmation required','Confirm that you want to replace records for this station only.',true);
      const imported=normalizeBackup(modal.importedState);if(!imported)return notify('Backup could not be validated','Choose a valid station backup (schema 1, 2 or 3).',true);
      const oldCount=stationRecordCount(state),sourceName=modal.fileName||'backup JSON',entry=stationEntryById(activeStationId);
      imported.users=stationDirectory.users;
      imported.station={...(imported.station||{}),id:activeStationId,name:entry&&entry.name||state.station.name,location:entry&&entry.location||state.station.location};
      ensureDispenserSetup(imported,imported.station.dispenserCount);applyGlobalPriceLevels(imported);stampStationContext(imported);
      state=imported;addAudit('Station backup restored',state.station.name,`${oldCount} current records`,`Backup loaded · ${sourceName}`,'Manager restored records for this station only; other station workspaces and Supervisor assignments were retained.');
      saveState();modal=null;activePage='data';render();notify('Station backup loaded',`${sourceName} was restored to ${state.station.name}. Other stations and Supervisor assignments were not changed.`);
    }
    function reportExport() {
      const def=reportDefinition(selectedReport,reportDate);
      const slug=selectedReport.replace(/[^a-z0-9-]/gi,'-');
      exportCsv(`${fileSlug(orgName())}-${slug}-${reportDate}.csv`,def.headers,def.rows);
      notify('Report exported',`${def.title} downloaded as CSV.`);
    }
    function auditExport() {
      const rows=sortRecords(state.audit).map(a=>[dateTime(a.at),a.user,a.role,a.action,a.record,a.oldValue,a.newValue,a.reason||'']);
      exportCsv(`${fileSlug(orgName())}-audit-${TODAY}.csv`,['Date/time','User','Role','Action','Record','Original value','New value / decision','Reason / comments'],rows);
      notify('Audit log exported','The current audit trail was downloaded as CSV.');
    }

    function handleClick(event) {
      if(paletteOpen){
        if(!event.target.closest('.palette')){closePalette();return;}
        if(!event.target.closest('.palette-item'))return;
        closePalette(false);
      }
      if(notificationsOpen&&!event.target.closest('.notif-wrap')){notificationsOpen=false;const pop=document.querySelector('.notif-popover');if(pop)pop.remove();const bell=document.querySelector('[data-action="notifications"]');if(bell)bell.setAttribute('aria-expanded','false');}
      const el=event.target.closest('[data-action], [data-page], [data-report]'); if(!el||el.classList.contains('page-content'))return;
      // The modal backdrop ancestor-matches every click inside the dialog; those clicks belong to the
      // dialog's own controls (submit buttons, labels, fields) — never cancel or close on their behalf.
      if(el.classList.contains('modal-backdrop')&&event.target!==el)return;
      // Intercept handled controls and cancel the browser default: actions resolve as inline state
      // updates or modals — an unguarded default was the source of the unwanted full-window reload.
      // Native form controls and labels keep their built-in behaviour (checkbox toggle, select picker).
      if(!event.target.closest('input, select, textarea, label, option, summary'))event.preventDefault();
      if(el.dataset.page){ setPage(el.dataset.page); return; }
      if(el.dataset.action==='switch-station'){switchActiveStation(el.dataset.id);return;}
      if(el.dataset.action==='manager-open-station'){
        if(!isManager())return notify('Permission denied','Only an authorized manager can open a station drill-down.',true);
        const id=String(el.dataset.id||'');
        if(!stationEntryById(id))return notify('Station not found','That station is no longer in the station directory.',true);
        managerHomeMode='station';
        if(id===String(activeStationId)){transitionPage(()=>{});return;}
        switchActiveStation(id);   // rehydrates station context and renders the dashboard in station mode
        return;
      }
      if(el.dataset.action==='manager-show-all'){
        if(managerHomeMode!=='aggregate'){transitionPage(()=>{managerHomeMode='aggregate';});}
        return;
      }
      if(el.dataset.action==='toggle-theme'){switchTheme();return;}
      if(el.dataset.action==='open-palette'){openPalette();return;}
      if(el.dataset.action==='dismiss-toast'){toast=null;clearTimeout(toastTimer);render();return;}
      if(el.dataset.action==='toggle-sidebar'){toggleSidebarCollapsed();return;}
      if(el.dataset.action==='toggle-drawer'){setDrawer(!drawerOpen);return;}
      if(el.dataset.action==='close-drawer'){setDrawer(false);return;}
      if(el.dataset.action==='open-banking-alert'){if(!currentUser)return;openModal('banking-alert');return;}
      if(el.dataset.action==='dismiss-banking-alert'){dismissBankingAlert();return;}
      if(el.dataset.action==='trend-mode'){const mode=el.dataset.mode==='fuel'?'fuel':'total';if(mode!==uiPrefs.trendView){animFlags.charts=true;transitionPage(()=>{uiPrefs.trendView=mode;saveUiPrefs();});}return;}
      if(el.dataset.action==='trend-range'){const range=Number(el.dataset.range);if([7,14,30].includes(range)&&range!==uiPrefs.trendRange){animFlags.charts=true;transitionPage(()=>{uiPrefs.trendRange=range;saveUiPrefs();});}return;}
      if(el.dataset.action==='open-dispenser-report'){selectedReport='dispenser-summary';reportDate=TODAY;setPage('reports');return;}
      if(el.dataset.action==='logout'){logout();return;}
      if(el.dataset.action==='change-password'){if(!currentUser)return;openModal('change-password');return;}
      if(el.dataset.action==='reset-password'){if(!isManager())return notify('Permission denied','Only the Manager can reset Supervisor passwords.',true);openModal('reset-password',{id:el.dataset.id});return;}
      if(el.dataset.action==='open-modal'){openModal(el.dataset.modal,{id:el.dataset.id});return;}
      if(el.dataset.action==='manager-global-review'){
        if(!isManager())return notify('Permission denied','Only the authorized Manager can review station requests.',true);
        const stationId=String(el.dataset.stationId||''),entry=stationEntryById(stationId),kind=el.dataset.kind;
        if(!entry)return notify('Station not found','The station attached to this request is no longer available.',true);
        if(stationId!==activeStationId)switchActiveStation(stationId);
        activePage='approvals';
        const modalType={delivery:'delivery-decision',meter:'meter-decision',price:'price-decision',deposit:'deposit-decision',discrepancy:'review-discrepancy'}[kind];
        if(!modalType)return notify('Review type not recognized','Refresh the all-station Manager queue and try again.',true);
        openModal(modalType,{id:el.dataset.id,decision:el.dataset.decision});return;
      }
      if(el.dataset.action==='supervisor-bank-entry'||el.dataset.action==='bank-now'){
        if(!isSupervisor())return notify('Permission denied','Only supervisors can enter bank deposit details.',true);
        const now=new Date(),oldestDue=bankingAlertState(now).items.filter(item=>item.summary.toBank>0.005).slice(-1)[0];
        const businessDate=el.dataset.date||(activePage==='deposits'?depositDateFilter:(oldestDue?oldestDue.businessDate:activeDepositBusinessDate(now)));
        const summary=depositStatus(businessDate,now),metrics=dailyMetrics(businessDate),windowOpen=now>=new Date(`${shiftDate(businessDate,1)}T00:00:00`);
        if(summary.closed&&windowOpen&&metrics.sales>0&&summary.toBank>0.005){depositDateFilter=businessDate;activePage='deposits';openModal('deposit');return;}
        const pending=state.deposits.find(d=>d.businessDate===businessDate&&d.workflow===DEPOSIT_WORKFLOW&&d.status==='Pending manager approval')||sortRecords(pendingDepositApprovals())[0]||null;
        if(pending){depositDateFilter=pending.businessDate;activePage='deposits';openModal('deposit-edit',{id:pending.id});return;}
        depositDateFilter=businessDate;setPage('deposits');
        if(summary.fullyBanked)return notify('Fully banked',`${dateShort(businessDate)} is fully banked and approved.`);
        if(metrics.sales<=0)return notify('No sales to bank',`No pump-meter sales are recorded for ${dateShort(businessDate)}.`);
        if(!summary.closed)return notify('Business day is still open','The final sales value is available after the 9:00 pm close.');
        if(!windowOpen)return notify('Bank details open the next morning','Enter the receipt details after banking on the morning after the close.');
        return notify('Awaiting Manager approval','All deposits for this date are submitted and awaiting Manager approval.');
      }
      if(el.dataset.action==='open-deposit-date'){if(!isSupervisor())return notify('Permission denied','Only supervisors can enter bank deposit details.',true);depositDateFilter=el.dataset.date||activeDepositBusinessDate();setPage('deposits');return;}
      if(el.dataset.action==='close-modal'){closeModal();return;}
      if(el.dataset.action==='delivery-filter'){transitionPage(()=>{deliveryFilter=el.dataset.filter;});return;}
      if(el.dataset.action==='discrepancy-filter'){transitionPage(()=>{discrepancyFilter=el.dataset.filter;});return;}
      if(el.dataset.action==='select-report'){transitionPage(()=>{selectedReport=el.dataset.report;});return;}
      if(el.dataset.action==='manager-dashboard-view'){
        if(!isManager())return notify('Permission denied','Only the authorized manager can switch manager dashboard views.',true);
        if(['stock','sales','performance'].includes(el.dataset.view)&&el.dataset.view!==managerDashboardView){transitionPage(()=>{managerDashboardView=el.dataset.view;});}
        return;
      }
      if(el.dataset.action==='manager-tank-fuel'){
        if(!isManager())return notify('Permission denied','Only the authorized manager can switch tank reconciliations.',true);
        if(['Petrol','Diesel'].includes(el.dataset.fuel)&&el.dataset.fuel!==managerTankFuel){transitionPage(()=>{managerTankFuel=el.dataset.fuel;});}
        return;
      }
      if(el.dataset.action==='delivery-decision'){ if(!isManager())return notify('Permission denied','Only the authorized manager can decide this request.',true); openModal('delivery-decision',{id:el.dataset.id,decision:el.dataset.decision});return; }
      if(el.dataset.action==='meter-decision'){ if(!isManager())return notify('Permission denied','Only the authorized manager can decide this request.',true); openModal('meter-decision',{id:el.dataset.id,decision:el.dataset.decision});return; }
      if(el.dataset.action==='price-decision'){ if(!isManager())return notify('Permission denied','Only the authorized manager can decide selling-price requests.',true); openModal('price-decision',{id:el.dataset.id,decision:el.dataset.decision});return; }
      if(el.dataset.action==='review-discrepancy'){ if(!isManager())return notify('Permission denied','Only the authorized manager can review discrepancies.',true); openModal('review-discrepancy',{id:el.dataset.id});return; }
      if(el.dataset.action==='edit-deposit'){if(!isSupervisor())return notify('Permission denied','Only supervisors can update bank details before Manager review.',true);const d=state.deposits.find(row=>row.id===el.dataset.id);if(!d||d.workflow!==DEPOSIT_WORKFLOW||d.status!=='Pending manager approval')return notify('Deposit can no longer be changed','Only a deposit awaiting Manager review can be updated.',true);openModal('deposit-edit',{id:d.id});return;}
      if(el.dataset.action==='deposit-decision'){ if(!isManager())return notify('Permission denied','Only an authorized manager can approve or reject bank deposits.',true); if(!['approve','reject'].includes(el.dataset.decision))return; openModal('deposit-decision',{id:el.dataset.id,decision:el.dataset.decision});return; }
      if(el.dataset.action==='delete-supervisor'){ if(!isManager())return notify('Permission denied','Only an authorized manager can delete Supervisor accounts.',true); openModal('delete-supervisor',{id:el.dataset.id});return; }
      if(el.dataset.action==='export-backup'){exportStationBackup();return;}
      if(el.dataset.action==='load-backup'){chooseBackupFile();return;}
      if(el.dataset.action==='manage-auto-backups'){openAutosaveVersionManager();return;}
      if(el.dataset.action==='retry-autosave'){retryAutosavePersistence();return;}
      if(el.dataset.action==='export-full-backup'){exportFullBackup();return;}
      if(el.dataset.action==='create-recovery-point'){createManualRecoveryPoint();return;}
      if(el.dataset.action==='storage-status'){if(!currentUser)return;openModal('storage-status');checkStorageEstimate().then(()=>{if(modal&&modal.type==='storage-status')render();}).catch(()=>{});return;}
      if(el.dataset.action==='go-data'){modal=null;setPage('data');return;}
      if(el.dataset.action==='select-auto-backup'){
        if(!isManager())return notify('Permission denied','Only the authorized Manager can restore full-workspace backups.',true);
        const backupId=String(el.dataset.backupId||'');if(!autosaveVersions.some(item=>item.id===backupId))return notify('Backup version unavailable','Refresh the automatic backup list and select a verified version.',true);
        openModal('auto-backup-confirm',{backupId});return;
      }
      if(el.dataset.action==='clear-station-data'){if(!isManager())return notify('Permission denied','Only the Manager can clear the active station.',true);openModal('data-reset',{mode:'empty'});return;}
      if(el.dataset.action==='export-report'){reportExport();return;}
      if(el.dataset.action==='print-report'){window.print();return;}
      if(el.dataset.action==='export-audit'){auditExport();return;}
      if(el.dataset.action==='audit-more'){auditLimit+=AUDIT_PAGE*2;render();const more=document.querySelector('[data-action="audit-more"]')||document.querySelector('.table-more-count');if(more)more.focus({preventScroll:true});return;}
      if(el.dataset.action==='notifications'){notificationsOpen=!notificationsOpen;animFlags.popover=notificationsOpen;render();if(notificationsOpen){const first=document.querySelector('.notif-popover .notif-item');if(first)first.focus({preventScroll:true});}return;}
      if(el.dataset.action==='backdrop-close' && event.target===el){closeModal();return;}
    }
    function handleInput(event) {
      if(event.target.id==='palette-input'){paletteQuery=event.target.value;paletteIndex=0;refreshPaletteList();return;}
      if(event.target.closest('#reading-form')) updateReadingPreview();
      if(event.target.closest('#stock-reading-form')) updateStockVariancePreview();
      const capacityForm=event.target.closest('.station-capacity-form');
      if(capacityForm){const total=Number(capacityForm.elements.superCapacity.value||0)+Number(capacityForm.elements.dieselCapacity.value||0),output=capacityForm.querySelector('[data-capacity-total]');if(output)output.textContent=`${num(total,0)} L`;}
    }
    function handleChange(event) {
      const target=event.target;
      setTimeout(flushDeferredRender,50); // a choice was committed — safe to paint any queued background render
      if(target.dataset.change==='station-context'){switchActiveStation(target.value);return;}
      if(target.id==='backup-file'){const file=target.files&&target.files[0];target.value='';if(file)inspectBackupFile(file);return;}
      if(target.dataset.change==='reading-date'){readingDate=target.value||TODAY;render();return;}
      if(target.dataset.change==='deposit-date'){depositDateFilter=target.value||YESTERDAY;render();return;}
      if(target.dataset.change==='report-date'){reportDate=target.value||TODAY;render();return;}
      if(target.id==='pr-fuel'){const current=document.getElementById('pr-current');if(current)current.value=num(currentFuelPrice(target.value),2);return;}
      if(target.id==='del-emergency'){
        const wrap=document.getElementById('emergency-fields'); if(wrap) wrap.classList.toggle('hidden',!target.checked);
        const required=['del-actual','del-postdip','del-poststock','del-auth','del-reason']; required.forEach(id=>{const input=document.getElementById(id);if(input)input.required=target.checked;});return;
      }
      if(target.closest('#reading-form') && ['rd-nozzle','rd-date','rd-shift'].includes(target.id)){updateReadingNozzle();return;}
      if(target.closest('#stock-reading-form') && ['dip-tank','dip-date','dip-stage'].includes(target.id)){updateStockVariancePreview();return;}
      if(target.closest('#meter-request-form') && ['mr-nozzle','mr-date','mr-shift'].includes(target.id)){updateMeterRequestBaseline();return;}
      if(target.id==='disc-action'){const wrap=document.getElementById('disc-adjust-wrap'); if(wrap)wrap.classList.toggle('hidden',target.value!=='adjust');const input=document.getElementById('disc-adjust');if(input)input.required=target.value==='adjust';return;}
    }

    function createStation(form){
      if(!isManager())return notify('Permission denied','Only the Manager can create stations.',true);
      const fd=new FormData(form),name=String(fd.get('name')||'').trim(),location=String(fd.get('location')||'').trim(),pumpCount=Number(fd.get('pumpCount'));
      if(name.length<2)return notify('Station name required','Enter a clear station name with at least two characters.',true);
      if(stationDirectory.stations.some(entry=>entry.name.trim().toLowerCase()===name.toLowerCase()))return notify('Station name already exists','Use a unique name so staff can distinguish this station.',true);
      if(location.length<2)return notify('Station location required','Enter the town, area or address for this site.',true);
      if(!Number.isInteger(pumpCount)||pumpCount<1||pumpCount>50)return notify('Invalid pump count','Set a whole number of pumps from 1 to 50.',true);
      const selected=new Set(fd.getAll('supervisorIds').map(String)),validUserIds=new Set(state.users.filter(user=>user.role==='supervisor').map(user=>user.id));
      [...selected].forEach(id=>{if(!validUserIds.has(id))selected.delete(id);});
      saveState();
      const id=makeId('STA'),data=makeSeedState();
      data.station={...data.station,id,name,location,dispenserCount:pumpCount,bankingPolicy:['sales'],requirePreUnloadApproval:true};
      data.users=stationDirectory.users;
      STATION_RECORD_COLLECTIONS.forEach(key=>{data[key]=[];});
      data.tanks.forEach(tank=>{tank.openingStock=0;tank.physicalStock=0;tank.restrictedLitres=0;tank.dipAt=null;tank.stationId=id;});
      data.nozzles.forEach(nozzle=>{nozzle.maintenance='Operational';nozzle.stationId=id;});
      ensureDispenserSetup(data,pumpCount);stampStationContext(data);
      state.users.forEach(user=>{if(user.role==='supervisor'&&selected.has(user.id)){const ids=new Set(assignedStationIds(user));ids.add(id);user.stationIds=[...ids];}});
      const entry={id,name,location,pumpCount,supervisorIds:[...selected],data:stationDataOnly(data)};
      stationDirectory.stations.push(entry);stationDirectory.users=state.users;
      activeStationId=id;stationDirectory.activeStationId=id;state=hydrateStationEntry(entry);
      addAudit('Station created',id,'No station',`${name} · ${location} · ${pumpCount} pumps · ${pumpCount*2} nozzles`,`Two independent physical tanks provisioned. Each pump has one Super/Petrol nozzle to T-SUPER and one Diesel nozzle to T-DIESEL. ${selected.size} Supervisor assignment(s).`);
      saveState();activePage='setup';modal=null;render();
      notify('Station created',`${name} is ready with ${pumpCount} pumps, ${pumpCount*2} nozzles, a Super tank and a Diesel tank.`);
    }
    function saveStationIdentity(form){
      if(!isManager())return notify('Permission denied','Only the Manager can edit station identity.',true);
      const stationId=String(form.dataset.stationId||''),entry=stationEntryById(stationId),fd=new FormData(form),name=String(fd.get('name')||'').trim(),location=String(fd.get('location')||'').trim();
      if(!entry)return notify('Station not found','Choose a valid station.',true);
      if(name.length<2||name.length>70||location.length<2||location.length>100)return notify('Check station details','Name must be 2–70 characters and location 2–100 characters.',true);
      if(stationDirectory.stations.some(site=>site.id!==stationId&&site.name.trim().toLowerCase()===name.toLowerCase()))return notify('Station name already exists','Choose a unique station name.',true);
      const old=`${entry.name} · ${entry.location||'No location'}`;entry.name=name;entry.location=location;entry.data.station={...(entry.data.station||{}),id:entry.id,name,location};
      if(stationId===activeStationId)state.station={...state.station,id:entry.id,name,location};
      recordStationAudit(stationId,'Station identity updated',entry.id,old,`${name} · ${location}`,'Manager updated station identity; historical operational records retain their original transaction context.');
      saveState();render();notify('Station details saved',`${name} · ${location}`);
    }
    function saveStationPumpCount(form){
      if(!isManager())return notify('Permission denied','Only the Manager can change pump counts.',true);
      const stationId=String(form.dataset.stationId||''),entry=stationEntryById(stationId),pumpCount=Number(new FormData(form).get('pumpCount'));
      if(!entry)return notify('Station not found','Choose a valid station from the directory.',true);
      if(!Number.isInteger(pumpCount)||pumpCount<1||pumpCount>50)return notify('Invalid pump count','Set a whole number of pumps from 1 to 50.',true);
      const data=stationId===activeStationId?state:cloneJson(entry.data),previous=(data.dispensers||[]).filter(dispenser=>dispenser.active).length;
      if(pumpCount===previous)return notify('No setup changes',`${entry.name} already has ${pumpCount} active pumps.`);
      const retiring=new Set((data.dispensers||[]).filter(dispenser=>dispenserNumber(dispenser.id)>pumpCount).map(dispenser=>dispenser.id));
      const retained=(data.readings||[]).filter(reading=>retiring.has(reading.dispenserId)||retiring.has((data.nozzles||[]).find(nozzle=>nozzle.id===reading.nozzleId)?.dispenser)).length;
      data.station={...(data.station||{}),id:entry.id,name:entry.name,location:entry.location,dispenserCount:pumpCount};
      data.users=stationDirectory.users;ensureDispenserSetup(data,pumpCount);applyGlobalPriceLevels(data);stampStationContext(data);
      entry.pumpCount=pumpCount;
      if(stationId===activeStationId){state=data;addAudit('Station pump count updated',entry.name,`${previous} active pumps`,`${pumpCount} active pumps · ${pumpCount*2} active nozzles`,`Each pump has one Super/Petrol nozzle to T-SUPER and one Diesel nozzle to T-DIESEL. ${retained} historical meter reading(s) retained.`);saveState();}
      else{entry.data=stationDataOnly(data);recordStationAudit(stationId,'Station pump count updated',entry.name,`${previous} active pumps`,`${pumpCount} active pumps · ${pumpCount*2} active nozzles`,`Each pump has one Super/Petrol nozzle to T-SUPER and one Diesel nozzle to T-DIESEL. ${retained} historical meter reading(s) retained.`);persistDirectorySnapshot();}
      render();notify('Pump setup saved',`${entry.name}: ${pumpCount} pumps now have ${pumpCount*2} active nozzles, with each fuel mapped to its own physical tank.`);
    }
    function saveStationTankConfiguration(form){
      if(!isManager())return notify('Permission denied','Only the Manager can edit underground tank settings.',true);
      const stationId=String(form.dataset.stationId||''),entry=stationEntryById(stationId),fd=new FormData(form);
      if(!entry)return notify('Station not found','Choose a valid station from the station directory.',true);
      const superCapacity=Number(fd.get('superCapacity')),dieselCapacity=Number(fd.get('dieselCapacity')),tolerance=Number(fd.get('tolerance'));
      const costOf=(key,tankFuel)=>{const raw=fd.get(key);if(raw===null||String(raw).trim()==='')return null;return Number(raw);};
      const superCost=costOf('superCost'),dieselCost=costOf('dieselCost');
      if([superCost,dieselCost].some(cost=>cost!==null&&(!Number.isFinite(cost)||cost<0||cost>1000)))return notify('Invalid purchase cost','Enter a purchase cost from 0 to 1,000 GHS per litre.',true);
      if(!Number.isInteger(superCapacity)||!Number.isInteger(dieselCapacity)||superCapacity<1000||dieselCapacity<1000||superCapacity>500000||dieselCapacity>500000||superCapacity+dieselCapacity>1000000)return notify('Invalid tank capacity','Enter whole-number capacities from 1,000 to 500,000 L per tank; combined station capacity must not exceed 1,000,000 L.',true);
      if(!Number.isFinite(tolerance)||tolerance<0||tolerance>100000)return notify('Invalid variance tolerance','Set a station variance tolerance from 0 to 100,000 L.',true);
      const data=stationId===activeStationId?state:cloneJson(entry.data),superTank=data.tanks.find(tank=>tank.fuel==='Petrol'),dieselTank=data.tanks.find(tank=>tank.fuel==='Diesel');
      if(!superTank||!dieselTank)return notify('Tank setup unavailable','The station must have one Super and one Diesel physical tank.',true);
      const physicalNow=tank=>{
        if(stationId===activeStationId)return tankMetrics(tank,TODAY).physical;
        const last=sortRecords((data.stockReadings||[]).filter(row=>row.tankId===tank.id&&row.businessDate===TODAY&&row.measurementType!=='Opening stock'))[0];
        return Number(last?last.physical:tank.physicalStock||0);
      };
      if(superCapacity<physicalNow(superTank)||dieselCapacity<physicalNow(dieselTank))return notify('Capacity below current physical stock','A tank capacity cannot be set lower than its latest physical stock. Record/verify a dip or enter a larger capacity.',true);
      const oldSuper=Number(superTank.capacity),oldDiesel=Number(dieselTank.capacity),oldTolerance=Number(data.station.varianceTolerance||0);
      const oldSuperCost=Number(superTank.purchaseCostPerLitre||0),oldDieselCost=Number(dieselTank.purchaseCostPerLitre||0),newSuperCost=superCost===null?oldSuperCost:Number(superCost.toFixed(2)),newDieselCost=dieselCost===null?oldDieselCost:Number(dieselCost.toFixed(2));
      const costChanged=newSuperCost!==oldSuperCost||newDieselCost!==oldDieselCost;
      if(oldSuper===superCapacity&&oldDiesel===dieselCapacity&&oldTolerance===tolerance&&!costChanged)return notify('No tank setting changes',`${entry.name} already uses these tank settings.`);
      superTank.purchaseCostPerLitre=newSuperCost;dieselTank.purchaseCostPerLitre=newDieselCost;
      data.station={...(data.station||{}),id:entry.id,name:entry.name,location:entry.location,varianceTolerance:tolerance};
      superTank.capacity=superCapacity;dieselTank.capacity=dieselCapacity;superTank.tolerance=tolerance;dieselTank.tolerance=tolerance;
      applyGlobalPriceLevels(data);stampStationContext(data);
      const detail=`Super ${num(oldSuper,0)} → ${num(superCapacity,0)} L · Diesel ${num(oldDiesel,0)} → ${num(dieselCapacity,0)} L · combined ${num(oldSuper+oldDiesel,0)} → ${num(superCapacity+dieselCapacity,0)} L · tolerance ${num(oldTolerance,0)} → ${num(tolerance,0)} L${costChanged?` · purchase cost Super GHS ${oldSuperCost.toFixed(2)} → ${newSuperCost.toFixed(2)}/L, Diesel GHS ${oldDieselCost.toFixed(2)} → ${newDieselCost.toFixed(2)}/L`:''}`;
      if(stationId===activeStationId){state=data;addAudit('Station tank capacity and tolerance updated',entry.name,detail,`${num(superCapacity+dieselCapacity,0)} L combined capacity · ${num(tolerance,0)} L tolerance`,'Manager configured this station’s two physical tank capacities and shared variance threshold.');saveState();}
      else{entry.data=stationDataOnly(data);recordStationAudit(stationId,'Station tank capacity and tolerance updated',entry.name,detail,`${num(superCapacity+dieselCapacity,0)} L combined capacity · ${num(tolerance,0)} L tolerance`,'Manager configured this station’s two physical tank capacities and shared variance threshold.');persistDirectorySnapshot();}
      render();notify('Station tank settings saved',`${entry.name}: ${num(superCapacity+dieselCapacity,0)} L combined underground capacity · ${num(tolerance,0)} L tolerance.`);
    }
    /* The authorized Manager owns the company profile: the organisation name shown across the
       workspace (brand, login, reports, backups) plus an optional tagline. Changes are audited
       and propagate instantly — the same directory object every view reads. */
    function saveCompanyProfile(form){
      if(!isManager())return notify('Permission denied','Only the authorized Manager can modify company information.',true);
      const fd=new FormData(form),name=String(fd.get('name')||'').trim(),tagline=String(fd.get('tagline')||'').trim();
      if(name.length<2)return notify('Organisation name required','Enter at least two characters for the company name.',true);
      if(name.length>80)return notify('Organisation name too long','Keep the company name within 80 characters.',true);
      if(tagline.length>90)return notify('Tagline too long','Keep the tagline within 90 characters.',true);
      const previous=stationDirectory.organization||{},previousName=String(previous.name||'').trim(),previousTagline=String(previous.tagline||'').trim();
      if(previousName===name&&previousTagline===tagline)return notify('No company changes','The company information already matches these values.');
      stationDirectory.organization={...previous,name,updatedAt:new Date().toISOString(),updatedBy:currentUser.name,createdAt:previous.createdAt||new Date().toISOString()};
      if(tagline)stationDirectory.organization.tagline=tagline;else delete stationDirectory.organization.tagline;
      addAudit('Company information updated',name,`Organisation “${previousName||'—'}”`,`Organisation “${name}”${tagline?` · tagline “${tagline}”`:' · custom tagline cleared'}`,`Modified by ${currentUser.name} (authorized Manager). Branding, login screen, reports and backup envelopes now use the new details.`);
      saveState();render();notify('Company profile saved',`The workspace now presents “${name}”. Update downloaded backups after major changes.`);
    }
    function saveGlobalPrices(form){
      if(!isManager())return notify('Permission denied','Only the authorized Manager can set prices for all stations.',true);
      const fd=new FormData(form),petrol=Number(fd.get('petrolPrice')),diesel=Number(fd.get('dieselPrice')),reason=String(fd.get('reason')||'').trim();
      if(!Number.isFinite(petrol)||!Number.isFinite(diesel)||petrol<=0||diesel<=0||petrol>1000||diesel>1000)return notify('Invalid global price','Enter positive GHS-per-litre rates up to GHS 1,000 for both fuels.',true);
      if(reason.length<3)return notify('Price update reason required','Enter a short reason for the shared station price update.',true);
      const changed=[];
      if(applyGlobalPriceLevel('Petrol',petrol,{reason,actor:currentUser.name}))changed.push('Super / Petrol');
      if(applyGlobalPriceLevel('Diesel',diesel,{reason,actor:currentUser.name}))changed.push('Diesel');
      if(!changed.length)return notify('No price changes detected','The global prices already match these rates.');
      saveState();render();notify('Global prices applied',`${changed.join(' and ')} updated across ${stationDirectory.stations.length} station${stationDirectory.stations.length===1?'':'s'} for future readings. Historical sales remain unchanged.`);
    }
    function saveStationAssignments(form){
      if(!isManager())return notify('Permission denied','Only the Manager can assign Supervisors to stations.',true);
      const stationId=String(form.dataset.stationId||''),entry=stationEntryById(stationId);
      if(!entry)return notify('Station not found','Choose a valid station from the directory.',true);
      const validUsers=state.users.filter(user=>user.role==='supervisor'),selected=new Set(new FormData(form).getAll('supervisorIds').map(String));
      [...selected].forEach(id=>{if(!validUsers.some(user=>user.id===id))selected.delete(id);});
      const previous=validUsers.filter(user=>assignedStationIds(user).includes(stationId)).map(user=>user.id).sort(),next=[...selected].sort();
      if(JSON.stringify(previous)===JSON.stringify(next))return notify('No access changes',`Supervisor assignments for ${entry.name} are unchanged.`);
      const affected=new Set();
      validUsers.forEach(user=>{
        const ids=new Set(assignedStationIds(user)),was=ids.has(stationId),will=selected.has(user.id);
        if(was!==will){affected.add(user.id);if(will)ids.add(stationId);else ids.delete(stationId);user.stationIds=[...ids];}
      });
      stationDirectory.users=state.users;
      stationDirectory.stations.forEach(site=>{site.supervisorIds=validUsers.filter(user=>assignedStationIds(user).includes(site.id)).map(user=>user.id);});
      affected.forEach(userId=>{
        const user=validUsers.find(item=>item.id===userId);if(!user)return;
        const assigned=selected.has(userId);
        recordStationAudit(stationId,'Supervisor station access updated',user.name,assigned?'Not assigned':'Assigned',assigned?'Assigned':'Not assigned',`Manager ${assigned?'granted':'removed'} Supervisor access for ${entry.name}.`);
      });
      saveState();render();notify('Supervisor access saved',`${next.length} Supervisor${next.length===1?'':'s'} assigned to ${entry.name}.`);
    }

    function saveDispenserCount(form) {
      if(!isManager())return notify('Permission denied','Only the authorized manager can change station hardware setup.',true);
      const count=Number(new FormData(form).get('dispenserCount'));
      if(!Number.isInteger(count)||count<1||count>50)return notify('Invalid dispenser count','Enter a whole number from 1 to 50.',true);
      const previous=state.dispensers.filter(dispenser=>dispenser.active).length;
      if(count===previous)return notify('No setup changes','The station already has this number of active dispensers.');
      const retiring=new Set(state.dispensers.filter(dispenser=>dispenserNumber(dispenser.id)>count).map(dispenser=>dispenser.id));
      const retainedReadings=state.readings.filter(reading=>retiring.has(reading.dispenserId)||retiring.has((nozzleById(reading.nozzleId)||{}).dispenser)).length;
      ensureDispenserSetup(state,count);
      addAudit('Station dispenser count updated',state.station.name||'Station 01',`${previous} active dispensers`,`${count} active dispensers · ${count*2} active nozzles`,count<previous?`Dispensers above ${count} deactivated; ${retainedReadings} historical reading(s) retained.`:'One Super/Petrol and one Diesel nozzle provisioned per dispenser.');
      saveState();render();notify('Dispenser setup saved',`${count} active dispenser${count===1?'':'s'} now each have one Super/Petrol and one Diesel nozzle. ${count<previous?`${retainedReadings} historical reading(s) were preserved.`:''}`);
    }
    function createSupervisor(form) {
      if(!isManager())return notify('Permission denied','Only the authorized Manager can create Supervisor accounts.',true);
      const fd=new FormData(form),name=String(fd.get('name')||'').trim(),username=String(fd.get('username')||'').trim().toLowerCase(),password=String(fd.get('password')||'');
      if(name.length<2)return notify('Enter a full name','A Supervisor name must contain at least two characters.',true);
      if(!/^[a-z0-9._-]{3,30}$/i.test(username))return notify('Invalid username','Use 3–30 letters, numbers, dots, underscores or hyphens.',true);
      if(username===String(managerAccount()&&managerAccount().username||'').toLowerCase()||state.users.some(user=>String(user.username).toLowerCase()===username))return notify('Username already in use','Choose a unique username that is not assigned to another station account.',true);
      const weak=passwordProblem(password);if(weak)return notify('Temporary password is too weak',weak,true);
      const initials=name.split(/\s+/).slice(0,2).map(part=>part[0].toUpperCase()).join('');
      // Regional Business Manager workflow: a new Supervisor account starts UNASSIGNED — no station
      // context and no inherited operational data. Only the Manager grants station access afterwards,
      // explicitly, from the station cards below. Login for an unassigned account shows guidance.
      const user={id:makeId('USR'),username,password,role:'supervisor',name,initials,stationIds:[],lastStationId:null,createdAt:new Date().toISOString(),createdBy:currentUser.name};
      state.users.unshift(user);
      addAudit('Supervisor account created',username,'No account',`${name} · Supervisor · unassigned`,'Account created with no station assignment. The Manager must configure station access from the directory before this Supervisor can sign in; password was not written to the audit trail.');
      saveState();render();notify('Supervisor account created',`${name} is ready but unassigned. Grant station access from the station cards below so they can sign in.`);
    }
    function deleteSupervisor(form) {
      if(!isManager())return notify('Permission denied','Only the authorized Manager can remove Supervisor access.',true);
      const id=form.dataset.id,account=state.users.find(user=>user.id===id);
      if(!account||account.role!=='supervisor')return notify('Account cannot be deleted','Only a Supervisor account can be removed. The Manager login is protected.',true);
      if(new FormData(form).get('confirm')!=='on')return notify('Confirmation required','Confirm that the Supervisor sign-in should be disabled.',true);
      const assigned=assignedStationIds(account).map(stationEntryById).filter(Boolean).map(entry=>entry.name);
      const historyCount=stationDirectory.stations.reduce((sum,entry)=>sum+((entry.data&&entry.data.readings)||[]).filter(reading=>reading.createdBy===account.name).length,0);
      state.users=state.users.filter(user=>user.id!==id);
      stationDirectory.stations.forEach(entry=>{entry.supervisorIds=(entry.supervisorIds||[]).filter(userId=>userId!==id);});
      addAudit('Supervisor account deleted',account.username,`${account.name} · ${assigned.join(', ')||'no station assignment'}`,'Future sign-in disabled',`${historyCount} pump reading(s) across stations and all other historical records remain unchanged.`);
      saveState();modal=null;render();notify('Supervisor access removed',`${account.name} can no longer sign in. Historical station records and audit trails were retained.`);
    }

    function createDelivery(form) {
      if(!isSupervisor()) return notify('Permission denied','Only supervisors can register deliveries.',true);
      const fd=new FormData(form); const emergency=fd.get('emergency')==='on';
      const tank=tankById(fd.get('tankId')); if(!tank) return notify('Select a receiving tank','The chosen tank was not found.',true);
      const stated=Number(fd.get('statedQty')||0), pre=Number(fd.get('preStock')||0), rawPreDip=String(fd.get('preDipReading')||'').trim(), preDip=rawPreDip===''?null:Number(rawPreDip), rawPostDip=String(fd.get('postDipReading')||'').trim(), postDip=rawPostDip===''?null:Number(rawPostDip), date=fd.get('businessDate')||TODAY;
      if(tank.fuel!==fd.get('fuelType')) return notify('Fuel and tank do not match',`Tank ${tank.id} is configured for ${tank.fuel}. Select a matching receiving tank.`,true);
      if(stated<=0) return notify('Check delivery quantity','Delivery note quantity must be greater than zero.',true);
      if(preDip===null||!Number.isFinite(preDip)||preDip<0||postDip!==null&&(!Number.isFinite(postDip)||postDip<0))return notify('Check dip readings','Enter a non-negative pre-delivery dip reading; exceptional receipts also require a valid post-delivery dip.',true);
      if(!Number.isFinite(pre)||pre<0||pre>Number(tank.capacity)) return notify('Pre-delivery volume is invalid','Enter a non-negative pre-delivery volume within tank capacity.',true);
      if(emergency && (!Number(fd.get('actualQty')) || postDip===null || !fd.get('postStock') || !fd.get('exceptionReason') || !fd.get('exceptionAuthority'))) return notify('Complete exception details','Quantity, post-dip, authorization and reason are required.',true);
      if(emergency && Number(fd.get('postStock'))>Number(tank.capacity)) return notify('Post-delivery dip exceeds capacity','Check the tank measurement and delivery quantity.',true);
      const seq=1043+state.deliveries.length;
      const id=`DLV-${date.replaceAll('-','')}-${String(seq).padStart(4,'0')}`;
      const deliveryDocName=form.elements.deliveryDoc.files&&form.elements.deliveryDoc.files[0]?form.elements.deliveryDoc.files[0].name:'';
      const d={id,businessDate:date,driver:fd.get('driver').trim(),contact:fd.get('contact').trim(),vehicle:fd.get('vehicle').trim().toUpperCase(),supplier:fd.get('supplier').trim(),deliveryNote:fd.get('deliveryNote').trim(),deliveryDocName,fuelType:fd.get('fuelType'),tankId:tank.id,statedQty:stated,preDipReading:preDip,preStock:pre,actualQty:emergency?Number(fd.get('actualQty')):null,postDipReading:emergency?postDip:null,postStock:emergency?Number(fd.get('postStock')):null,approvedQty:null,previousTankBalance:null,updatedTankBalance:null,stockPostingId:null,emergency,exceptionReason:emergency?fd.get('exceptionReason').trim():'',exceptionAuthority:emergency?fd.get('exceptionAuthority').trim():'',status:'pending',receiptStatus:emergency?'Exceptional receipt · manager review required':'Awaiting manager approval before unloading',createdBy:currentUser.name,createdAt:new Date().toISOString(),approvalDecision:null,stockApplied:false,comments:''};
      state.deliveries.unshift(d);
      addAudit('Delivery submitted for manager approval',d.id,'Not registered',`Pending · ${num(stated,1)} L ${d.fuelType}`,emergency?`Emergency exception: ${d.exceptionReason}`:'Pre-unload approval required');
      if(emergency){
        const increase=Number(d.postStock)-Number(d.preStock), diff=increase-Number(d.actualQty), tolerance=configuredTankTolerance(tank);
        if(Math.abs(diff)>tolerance) addDiscrepancy({type:'Delivery stock check',businessDate:date,tankId:tank.id,recordId:d.id,variance:diff,expected:Number(d.actualQty),physical:increase,tolerance,details:`Measured tank increase of ${num(increase,1)} L differs from actual received quantity of ${num(d.actualQty,1)} L.`,explanation:d.exceptionReason});
        if(Math.abs(d.actualQty-stated)>tolerance) addDiscrepancy({type:'Delivery quantity difference',businessDate:date,tankId:tank.id,recordId:d.id,variance:Number(d.actualQty-stated),expected:stated,physical:d.actualQty,tolerance,details:`Actual receipt differs from delivery note by ${num(d.actualQty-stated,1)} L.`,explanation:d.exceptionReason});
      }
      saveState(); modal=null; render(); notify('Delivery submitted',`${d.id} is pending manager approval.`);
    }
    function postDeliveryRefill(d, quantity, options={}) {
      if (d.stockPostingId || d.stockApplied) return {ok:false,duplicate:true};
      const tank=tankById(d.tankId);
      if(!tank)return {ok:false,error:'Receiving tank no longer exists.'};
      const qty=Number(quantity),capacity=Number(tank.capacity||0);
      if(!Number.isFinite(qty)||qty<=0)return {ok:false,error:'Approved quantity must be greater than zero.'};
      const preVolume=Number(d.preStock||0),systemBalanceBefore=Number(tank.physicalStock||0);
      const updated=options.measuredBalance==null?Number((preVolume+qty).toFixed(1)):Number(options.measuredBalance);
      if(!Number.isFinite(updated)||updated<0||updated>capacity)return {ok:false,error:`Updated balance ${num(updated,1)} L must be within tank capacity (${num(capacity,0)} L).`};
      const at=options.at||new Date().toISOString(),actor=options.actor||currentUser?.name||'System';
      const postingId=`DPOST-${d.id}`;
      d.approvedQty=qty;d.stockApplied=true;d.stockPostingId=postingId;d.stockPostedAt=at;d.stockPostedBy=actor;
      d.previousTankBalance=preVolume;d.systemBalanceBefore=systemBalanceBefore;d.updatedTankBalance=updated;
      d.stockPosting={id:postingId,deliveryId:d.id,supplier:d.supplier,driver:d.driver,contact:d.contact,vehicle:d.vehicle,deliveryNote:d.deliveryNote,deliveryDocName:d.deliveryDocName||'',tankId:d.tankId,fuelType:d.fuelType,statedQty:Number(d.statedQty||0),preDipReading:d.preDipReading??null,preVolume,postDipReading:d.postDipReading??null,postVolume:d.postStock??null,actualQty:d.actualQty??null,exceptionReason:d.exceptionReason||'',exceptionAuthority:d.exceptionAuthority||'',approvedQty:qty,systemBalanceBefore,previousBalance:preVolume,updatedBalance:updated,approver:actor,postedAt:at,status:'Posted'};
      tank.physicalStock=updated;
      if(options.measuredBalance!=null)tank.dipAt=at;
      if(!options.suppressReading)state.stockReadings.unshift({id:makeId('DIP'),businessDate:d.businessDate,tankId:d.tankId,measurementType:options.measuredBalance==null?'Delivery balance posting':'Delivery receipt',physical:updated,dipReading:options.postDipReading??null,method:options.measuredBalance==null?'Manager-approved volume roll-forward':'Manual tank dip · approved delivery receipt',remarks:options.measuredBalance==null?`Approved posting ${postingId}: ${num(preVolume,1)} L pre-volume + ${num(qty,1)} L approved refill = ${num(updated,1)} L. This is a calculated balance, not a dip reading.`:`Approved receipt ${d.id}${d.exceptionReason?`: ${d.exceptionReason}`:''}`,createdBy:actor,createdAt:at});
      return {ok:true,tank,previous:preVolume,systemBalanceBefore,updated,postingId,at};
    }

    function completeReceipt(form) {
      if(!isSupervisor()) return notify('Permission denied','Only supervisors can record receipt details.',true);
      const id=form.dataset.id,d=state.deliveries.find(x=>x.id===id);
      if(!d||d.status!=='approved_awaiting_receipt')return notify('Receipt not available','This delivery is not approved for receipt completion.',true);
      const fd=new FormData(form),actual=Number(fd.get('actualQty')||0),post=Number(fd.get('postStock')||0),rawPostDip=String(fd.get('postDipReading')||'').trim(),postDip=rawPostDip===''?null:Number(rawPostDip),remarks=String(fd.get('remarks')||'').trim();
      const tank=tankById(d.tankId),tolerance=configuredTankTolerance(tank);
      if(!tank||actual<=0||post<0||post>Number(tank.capacity||Infinity)||postDip===null||!Number.isFinite(postDip)||postDip<0)return notify('Check receipt values','Enter a valid actual quantity, optional non-negative dip reading, and a post-delivery volume within tank capacity.',true);
      const measured=Number((post-Number(d.preStock||0)).toFixed(1));
      let approved=Number(d.approvedQty ?? d.actualQty ?? d.statedQty ?? 0);
      if((!d.stockApplied||!d.stockPostingId)&&d.status==='approved_awaiting_receipt')approved=actual;
      const approvedDiff=Number((actual-approved).toFixed(1)),noteDiff=Number((actual-Number(d.statedQty)).toFixed(1)),stockDiff=Number((measured-approved).toFixed(1));
      if((Math.abs(stockDiff)>tolerance||Math.abs(approvedDiff)>tolerance||Math.abs(noteDiff)>tolerance)&&!remarks)return notify('Explanation required','Add receipt remarks because the measured change, actual quantity, approved quantity or supplier note differs beyond tolerance.',true);
      const at=new Date().toISOString();
      if(!reserveTransaction('delivery-receipt',d.id,`${actual} L received`))return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);
      // Legacy records approved under the earlier workflow are safely posted exactly once on receipt completion.
      if(!d.stockApplied||!d.stockPostingId){
        const legacyPosting=postDeliveryRefill(d,actual,{at,actor:currentUser.name,measuredBalance:post,postDipReading:postDip,suppressReading:true});
        if(!legacyPosting.ok){releaseTransaction(`delivery-receipt:${activeStationId}:${d.id}`);return notify('Unable to post delivery',legacyPosting.error||'This receipt was already posted. Refresh the delivery register.',true);}
        d.approvedQty=actual;d.stockPosting.quantity=actual;d.stockPosting.approver=d.approvalDecision?.approver||'Legacy manager approval';
      }
      const oldStatus=d.status;
      d.actualQty=actual;d.postStock=post;d.postDipReading=postDip;d.receiptRemarks=remarks;d.receivedAt=at;d.receivedBy=currentUser.name;d.status='received';d.receiptStatus='Receipt complete · tank dip reconciled';
      const priorPostedBalance=Number(d.updatedTankBalance??tank.physicalStock??0);
      tank.physicalStock=post;tank.dipAt=at;d.updatedTankBalance=post;d.reconciledAt=at;d.reconciledBy=currentUser.name;
      if(!d.receiptReadingId){d.receiptReadingId=makeId('DIP');state.stockReadings.unshift({id:d.receiptReadingId,businessDate:d.businessDate,tankId:d.tankId,measurementType:'Delivery receipt',physical:post,dipReading:postDip,method:'Manual tank dip · delivery receipt',remarks:`Post-unload volume for ${d.id}${postDip===null?'':` · dip ${num(postDip,1)} cm`}${remarks?`: ${remarks}`:''}`,createdBy:currentUser.name,createdAt:at});}
      if(d.stockPosting){d.stockPosting.receiptActualQty=actual;d.stockPosting.postDipReading=postDip;d.stockPosting.postVolume=post;d.stockPosting.reconciledBalance=post;d.stockPosting.receivedBy=currentUser.name;d.stockPosting.receivedAt=at;d.stockPosting.status='Receipt reconciled';}
      addAudit('Delivery receipt completed and reconciled',d.id,`${oldStatus} · pre ${d.preDipReading==null?'dip not recorded':`${num(d.preDipReading,1)} cm`} / ${num(d.preStock,1)} L · posted balance ${num(priorPostedBalance,1)} L`,`Approved ${num(approved,1)} L · actually received ${num(actual,1)} L · post ${postDip===null?'dip not recorded':`${num(postDip,1)} cm`} / ${num(post,1)} L · updated balance ${num(post,1)} L`,`Supplier ${d.supplier} · DN ${d.deliveryNote} · tank ${d.tankId} · manager ${d.approvalDecision?.approver||'legacy approval'} · receipt by ${currentUser.name} at ${at} · ${remarks||'Receipt verified'}`);
      if(Math.abs(stockDiff)>tolerance)addDiscrepancy({type:'Delivery stock check',businessDate:d.businessDate,tankId:tank.id,recordId:d.id,variance:stockDiff,expected:approved,physical:measured,tolerance,details:`Measured tank increase ${num(measured,1)} L differs from Manager-approved refill ${num(approved,1)} L.`,explanation:remarks});
      if(Math.abs(approvedDiff)>tolerance)addDiscrepancy({type:'Approved receipt quantity difference',businessDate:d.businessDate,tankId:tank.id,recordId:d.id,variance:approvedDiff,expected:approved,physical:actual,tolerance,details:`Actual receipt ${num(actual,1)} L differs from the Manager-approved volume ${num(approved,1)} L.`,explanation:remarks});
      if(Math.abs(noteDiff)>tolerance)addDiscrepancy({type:'Delivery quantity difference',businessDate:d.businessDate,tankId:tank.id,recordId:d.id,variance:noteDiff,expected:d.statedQty,physical:actual,tolerance,details:`Actual receipt differs from the supplier delivery note by ${num(noteDiff,1)} L.`,explanation:remarks});
      saveState();modal=null;render();notify('Receipt recorded',`${d.id}: ${num(actual,1)} L actual, ${num(approved,1)} L approved. Tank balance reconciled to ${num(post,1)} L.`);
    }
    function submitReading(form) {
      if(!isSupervisor())return notify('Permission denied','Only supervisors can enter pump readings.',true);
      const fd=new FormData(form);const date=fd.get('businessDate'),shift=fd.get('shift'),nozzle=nozzleById(fd.get('nozzleId'));
      if(!nozzle)return notify('Select a nozzle','No active nozzle was selected.',true);
      if(readingExists(nozzle.id,date,shift))return notify('Reading already exists',`A ${shift} shift record already exists for ${nozzle.id} on ${dateShort(date)}. Use another shift or request an authorized correction.`,true);
      const opening=Number(fd.get('opening')),closing=Number(fd.get('closing')),price=Number(fd.get('price'));
      if(closing<opening)return notify('Negative meter difference blocked','Closing meter reading cannot be less than opening. Submit a meter adjustment request for a reset or rollover.',true);
      const litres=Number((closing-opening).toFixed(1)),sales=Number((litres*price).toFixed(2));
      const payments={}; PAYMENT_KEYS.forEach(k=>payments[k]=Number(fd.get(`pay_${k}`)||0)); const collection=sumPayments(payments),gap=Number((sales-collection).toFixed(2));
      const remarks=String(fd.get('remarks')||'').trim();
      if(Math.abs(gap)>1&&!remarks)return notify('Collection difference needs a remark',`Sales value differs from entered collections by ${money(gap)}. Explain before saving.`,true);
      if(litres>2000&&!remarks)return notify('Unusual meter movement','A shift difference above 2,000 L needs a documented explanation.',true);
      const record={id:makeId('RDG'),businessDate:date,shift,nozzleId:nozzle.id,dispenserId:nozzle.dispenser,nozzleLabel:nozzle.label,fuelType:nozzle.fuel,tankId:nozzle.tankId,opening,closing,litres,price,salesValue:sales,payments:payObject(payments),remarks,createdBy:currentUser.name,createdAt:new Date().toISOString()};
      state.readings.unshift(record);
      addAudit('Pump meter reading submitted',`${record.dispenserId} · ${record.nozzleId} · ${shift}`,`${num(opening,1)} L opening`,`Closing ${num(closing,1)} L · ${num(litres,1)} L · ${money(sales)}`,remarks||'Shift reading');
      if(Math.abs(gap)>1)addDiscrepancy({type:'Sales collection difference',businessDate:date,recordId:record.id,variance:gap,expected:sales,physical:collection,details:`Calculated sales value ${money(sales)} differs from tender collections ${money(collection)}.`,explanation:remarks});
      if(litres>2000)addDiscrepancy({type:'Unexpected meter movement',businessDate:date,recordId:record.id,tankId:nozzle.tankId,variance:litres,expected:2000,physical:litres,details:`Nozzle sold ${num(litres,1)} L in one shift; exceeds the 2,000 L review threshold.`,explanation:remarks});
      saveState(); readingDate=date; modal=null; render(); notify('Shift reading saved',`${nozzle.dispenser} · ${nozzle.id}: ${num(litres,1)} L, ${money(sales)}.`);
    }
    function saveStockReading(form) {
      if(!isSupervisor())return notify('Permission denied','Only supervisors can record physical dips.',true);
      const fd=new FormData(form);const tank=tankById(fd.get('tankId')),date=fd.get('businessDate')||TODAY,physical=Number(fd.get('physical')||0),remarks=String(fd.get('remarks')||'').trim(),measurementType=fd.get('measurementType')||'Closing stock';
      if(!tank||physical<0||physical>Number(tank.capacity))return notify('Check tank reading','Enter a valid physical stock value within configured tank capacity.',true);
      const at=new Date().toISOString();
      if(measurementType==='Opening stock'){
        const openingBefore=tankMetrics(tank,date).opening;
        const r={id:makeId('DIP'),businessDate:date,tankId:tank.id,measurementType,physical,method:fd.get('method'),remarks,createdBy:currentUser.name,createdAt:at};
        state.stockReadings.unshift(r);
        if(date===TODAY){tank.physicalStock=physical;tank.dipAt=at;}
        addAudit('Opening tank stock recorded',tank.id,`${num(openingBefore,1)} L opening`,`Opening ${num(physical,1)} L`,remarks||r.method);
        saveState();modal=null;render();notify('Opening stock recorded',`${tank.id} opening balance is ${num(physical,1)} L.`);return;
      }
      const metric=tankMetrics(tank,date),variance=Number((physical-metric.expected).toFixed(1));
      if(Math.abs(variance)>metric.tolerance&&!remarks)return notify('Explanation required','A closing reading beyond tolerance requires an explanation before saving.',true);
      const old=tankMetrics(tank,date).physical;
      const r={id:makeId('DIP'),businessDate:date,tankId:tank.id,measurementType:'Closing stock',physical,method:fd.get('method'),remarks,createdBy:currentUser.name,createdAt:at};
      state.stockReadings.unshift(r);if(date===TODAY){tank.physicalStock=physical;tank.dipAt=at;}
      addAudit('Closing physical stock recorded',tank.id,`${num(old,1)} L last measured`,`Physical ${num(physical,1)} L · variance ${signedLitres(variance)}`,remarks||r.method);
      if(Math.abs(variance)>metric.tolerance)addDiscrepancy({type:'Stock variance',businessDate:date,tankId:tank.id,recordId:r.id,variance,expected:metric.expected,physical,tolerance:metric.tolerance,details:`Physical tank dip is ${signedLitres(variance)} against calculated expected closing stock.`,explanation:remarks});
      saveState();modal=null;render();notify('Closing stock recorded',`${tank.id} variance ${signedLitres(variance)}.`);
    }
    async function saveDeposit(form) {
      if(!isSupervisor())return notify('Permission denied','Only supervisors can enter bank deposit details.',true);
      const editingId=String(form.dataset.editId||'');
      const existing=editingId?state.deposits.find(d=>d.id===editingId):null;
      if(editingId&&(!existing||existing.workflow!==DEPOSIT_WORKFLOW||existing.status!=='Pending manager approval'))return notify('Deposit can no longer be changed','Only a deposit awaiting Manager review can be updated.',true);
      const fd=new FormData(form),businessDate=String(fd.get('businessDate')||''),depositDate=String(fd.get('depositDate')||''),depositTime=String(fd.get('depositTime')||''),bank=String(fd.get('bank')||'').trim(),branch=String(fd.get('branch')||'').trim(),receipt=String(fd.get('receipt')||'').trim(),method=String(fd.get('method')||'').trim(),comments=String(fd.get('comments')||'').trim(),editReason=String(fd.get('editReason')||'').trim();
      const amount=Number(fd.get('amount')||0),target=dailyMetrics(businessDate).sales,now=new Date(),today=localDateIso(now),nextMorning=shiftDate(businessDate,1),deadline=depositDeadlineAt(businessDate);
      if(!businessDate||!depositDate||!depositTime||!bank||!receipt||!method)return notify('Complete deposit details','Business date, banked date/time, bank, method and receipt reference are required.',true);
      if(existing&&!editReason)return notify('Correction reason required','Explain why the pending bank details are being updated.',true);
      if(target<=0)return notify('No sales to bank','No pump-meter sales value is recorded for the selected business date.',true);
      if(now.getTime()<depositCloseAt(businessDate).getTime())return notify('Business day is still open','Deposit entry becomes available after the 9:00 pm close, when the full-day sales target is final.',true);
      if(today<nextMorning)return notify('Deposit window has not opened','Bank this amount the morning after the 9:00 pm close, then enter the bank details.',true);
      if(depositDate<nextMorning)return notify('Check the banked date','The deposit date cannot be before the morning after this business date closes.',true);
      if(depositDate>today)return notify('Future deposit date not allowed','Enter the actual date on the bank receipt.',true);
      if(depositDate===today&&depositTime>`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`)return notify('Future deposit time not allowed','Enter the actual time shown on the bank receipt.',true);
      const stage=depositStatus(businessDate,now),remaining=Number((target-stage.banked-(stage.pendingAmount-(existing?Number(existing.amount||0):0))).toFixed(2));
      if(!existing&&remaining<=0.005)return notify('Nothing left to bank',`${money(target)} for ${dateShort(businessDate)} is already approved or awaiting Manager approval.`,true);
      if(!Number.isFinite(amount)||amount<=0)return notify('Enter the amount banked','Enter the amount shown on this bank slip. Staged deposits are allowed.',true);
      if(amount-remaining>0.005)return notify('Amount exceeds the outstanding balance',`Only ${money(remaining)} of the ${money(target)} sales value (${num(dailyMetrics(businessDate).litres,1)} L sold) remains to be banked. Excess amounts cannot be submitted.`,true);
      const duplicate=state.deposits.some(d=>d.id!==editingId&&d.workflow===DEPOSIT_WORKFLOW&&String(d.receipt||'').trim().toLowerCase()===receipt.toLowerCase()&&String(d.bank||'').trim().toLowerCase()===bank.toLowerCase()&&!(d.status==='Rejected'&&d.businessDate===businessDate));
      if(duplicate)return notify('Duplicate bank receipt','This bank and receipt reference already exists. Check the original record.',true);
      const late=depositDate>nextMorning||(depositDate===nextMorning&&depositTime>'10:00')||now.getTime()>deadline.getTime();
      if(late&&!comments)return notify('Late deposit explanation required','The 10:00 am next-morning deadline has passed. Add a reason before submitting this deposit for approval.',true);
      const receiptFile=form.elements&&form.elements.slip&&form.elements.slip.files&&form.elements.slip.files[0]?form.elements.slip.files[0]:null;
      if(receiptFile&&(!['image/jpeg','image/png','image/webp'].includes(receiptFile.type)||receiptFile.size>8*1024*1024))return notify('Invalid receipt image','Upload a JPG, PNG or WebP image no larger than 8 MB.',true);
      if(!receiptFile&&!existing?.receiptImage)return notify('Receipt image required','Attach a clear photograph of the bank receipt before submitting.',true);
      const receiptImage=receiptFile?await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('Could not read receipt image'));reader.readAsDataURL(receiptFile);}):existing.receiptImage;
      const slip=receiptFile?receiptFile.name:(existing&&existing.slipName||'');
      if(existing){
        const oldDetails=`${existing.bank} · ${existing.branch||'No branch'} · ${existing.receipt} · ${existing.method} · ${existing.depositDate} ${existing.depositTime||''} · slip ${existing.slipName||'none'}`;
        const updatedDetails=`${bank} · ${branch||'No branch'} · ${receipt} · ${method} · ${depositDate} ${depositTime} · slip ${slip||existing.slipName||'none'}`;
        Object.assign(existing,{depositDate,depositTime,bank,branch,receipt,method,slipName:slip,receiptImage,comments,late,updatedBy:currentUser.name,updatedAt:now.toISOString(),correctionReason:editReason});
        addAudit('Bank deposit details updated before approval',existing.id,oldDetails,updatedDetails,editReason);
        saveState();modal=null;render();notify('Bank details updated',`${money(existing.amount)} remains pending Manager approval; the correction was audit logged.`);return;
      }
      const d={id:makeId('DEP'),workflow:DEPOSIT_WORKFLOW,businessDate,depositDate,depositTime,amount:Number(amount.toFixed(2)),bank,branch,receipt,method,slipName:slip,receiptImage,stationId:state.station.id||activeStationId,stationName:state.station.name,supervisorId:currentUser.id,comments,late,status:'Pending manager approval',createdBy:currentUser.name,createdAt:now.toISOString(),approvalDecision:null,approvedBy:'',approvedAt:'',reviewComments:''};
      const after=Number((remaining-d.amount).toFixed(2));d.stage=stage.depositCount+1;d.targetAtSubmission=Number(target.toFixed(2));d.remainingAfter=after;
      state.deposits.unshift(d);addAudit('Bank deposit submitted for manager approval',d.id,`${money(remaining)} still to bank`,`${money(d.amount)} · ${bank} · ${receipt} · ${after>0.005?`${money(after)} still to bank`:'full sales value submitted'}`,`${after>0.005||d.stage>1?`Staged deposit ${d.stage} of`:'Full meter-sales value for'} ${dateShort(businessDate)} (target ${money(target)})${late?' · late deposit/entry: '+comments:''}`);
      saveState();depositDateFilter=businessDate;modal=null;render();notify('Deposit submitted',after>0.005?`${money(d.amount)} is awaiting Manager approval. ${money(after)} of ${money(target)} still has to be banked for ${dateShort(businessDate)}.`:`${money(d.amount)} completes the ${money(target)} sales value and is awaiting Manager approval.`);
    }
    function submitMaintenance(form) {
      if(!isSupervisor())return notify('Permission denied','Only supervisors can report station equipment issues.',true);
      const fd=new FormData(form),nozzle=nozzleById(fd.get('nozzleId'));if(!nozzle)return;
      const record={id:makeId('MNT'),dispenserId:nozzle.dispenser,nozzleId:nozzle.id,issue:String(fd.get('issue')).trim(),priority:fd.get('priority'),status:fd.get('priority')==='Routine'?'Open':'Scheduled',dueDate:fd.get('priority')==='Urgent'?TODAY:shiftDate(TODAY,3),reportedBy:currentUser.name,createdAt:new Date().toISOString(),note:String(fd.get('note')||'').trim()};
      state.maintenance.unshift(record);nozzle.maintenance=fd.get('priority')==='Urgent'?'Maintenance flagged':'Inspection due';addAudit('Maintenance issue reported',record.id,'Operational',`${record.status} · ${record.dispenserId} ${record.nozzleId}`,record.issue);
      saveState();modal=null;render();notify('Maintenance flag created',`${record.dispenserId} · ${record.nozzleId} has been logged.`);
    }
    function submitMeterRequest(form) {
      if(!isSupervisor())return notify('Permission denied','Only supervisors can request a meter adjustment.',true);
      const fd=new FormData(form);const nozzle=nozzleById(fd.get('nozzleId'));if(!nozzle)return;
      const req={id:makeId('MTR'),nozzleId:nozzle.id,businessDate:fd.get('businessDate'),shift:fd.get('shift'),adjustmentType:fd.get('adjustmentType'),previousReading:Number(fd.get('previousReading')||0),newReading:Number(fd.get('newReading')||0),reason:String(fd.get('reason')||'').trim(),status:'pending',createdBy:currentUser.name,createdAt:new Date().toISOString(),decision:null};
      state.meterRequests.unshift(req);addAudit('Meter adjustment requested',req.id,`${num(req.previousReading,1)} L`,`${num(req.newReading,1)} L proposed baseline`,req.reason);
      saveState();modal=null;render();notify('Adjustment request submitted',`${req.id} is awaiting manager authorization.`);
    }
    function submitPriceRequest(form) {
      if(!isSupervisor())return notify('Permission denied','Only supervisors can request a selling-price change.',true);
      const fd=new FormData(form),fuelType=String(fd.get('fuelType')||''),current=currentFuelPrice(fuelType),proposed=Number(fd.get('proposedPrice')||0),reason=String(fd.get('reason')||'').trim();
      if(!['Petrol','Diesel'].includes(fuelType)||proposed<=0)return notify('Check proposed price','Enter a positive price per litre.',true);
      if(Math.abs(proposed-current)<0.005)return notify('No price change detected','The proposed rate matches the current approved price.',true);
      if(pendingPriceRequests().some(request=>request.fuelType===fuelType))return notify('Price request already pending',`A ${fuelType.toLowerCase()} price change is already awaiting manager approval.`,true);
      const request={id:makeId('PRC'),fuelType,currentPrice:current,proposedPrice:Number(proposed.toFixed(2)),reason,status:'pending',createdBy:currentUser.name,createdAt:new Date().toISOString(),decision:null};
      state.priceRequests.unshift(request);
      addAudit('Selling price change requested',request.id,`${fuelType} ${money(current)}/L`,`Proposed ${money(request.proposedPrice)}/L`,reason);
      saveState();modal=null;render();notify('Price change submitted',`${fuelType} remains at ${money(current)}/L until the manager approves.`);
    }
    function decidePrice(form) {
      if(!isManager())return notify('Permission denied','Only the authorized manager can approve or reject selling-price changes.',true);
      const request=state.priceRequests.find(row=>row.id===form.dataset.id);
      if(!request||request.status!=='pending')return notify('Price request is no longer pending','Refresh the approval queue before acting.',true);
      if(request.createdBy===currentUser.name)return notify('Self-approval blocked','The requesting user cannot approve their own price change.',true);
      const fd=new FormData(form),decision=form.dataset.decision,comments=String(fd.get('comments')||'').trim();
      if(decision==='reject'&&!comments)return notify('Rejection reason required','Enter comments explaining why the requested price was rejected.',true);
      const current=currentFuelPrice(request.fuelType);
      if(decision==='approve'&&Math.abs(current-Number(request.currentPrice))>=0.005)return notify('Current price changed','This request is based on a different current rate. Ask the supervisor to submit a fresh request.',true);
      if(!reserveTransaction('price-decision',request.id,decision))return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);
      const at=new Date().toISOString();
      request.decision={decision,approver:currentUser.name,at,comments};
      if(decision==='approve'){
        const newPrice=Number(request.proposedPrice);
        applyGlobalPriceLevel(request.fuelType,newPrice,{requestId:request.id,requestedBy:request.createdBy,reason:request.reason,comments,at,actor:currentUser.name});
        request.status='Approved';request.effectiveAt=at;
      }else{
        request.status='Rejected';
        addAudit('Selling price change rejected',request.id,`${money(currentFuelPrice(request.fuelType))}/L`,`${money(request.proposedPrice)}/L not applied`,comments);
      }
      saveState();modal=null;render();notify(`Price request ${decision==='approve'?'approved':'rejected'}`,decision==='approve'?`${request.fuelType} is now ${money(request.proposedPrice)}/L across all stations for future readings.`:'Current approved pump price is unchanged.');
    }
    function decideDelivery(form) {
      if(!isManager())return notify('Permission denied','Only an authorized manager can approve or reject deliveries.',true);
      const d=state.deliveries.find(x=>x.id===form.dataset.id);
      if(!d||d.status!=='pending')return notify('Request is no longer pending','Refresh the approval queue before acting.',true);
      if(d.createdBy===currentUser.name)return notify('Self-approval blocked','The submitting user cannot approve their own delivery.',true);
      if(d.stockApplied||d.stockPostingId)return notify('Delivery already posted','This delivery has a stock-posting marker; a second approval cannot post it again.',true);
      const fd=new FormData(form),decision=form.dataset.decision,comments=String(fd.get('comments')||'').trim();
      if(!['approve','reject'].includes(decision))return notify('Decision not recognized','Choose approve or reject.',true);
      if(decision==='approve'&&(!d.receiptImage||!/^data:image\/(jpeg|png|webp);base64,/.test(d.receiptImage)))return notify('Receipt evidence required','This deposit has no valid attached receipt image. Reject it and request a corrected submission.',true);
      if(decision==='reject'&&!comments)return notify('Rejection reason required','Enter comments explaining the rejection.',true);
      const at=new Date().toISOString();
      if(decision==='approve'){
        const approvedQty=Number(fd.get('approvedQty')||0),tank=tankById(d.tankId),tolerance=configuredTankTolerance(tank),referenceQty=Number(d.emergency?(d.actualQty||d.statedQty):d.statedQty);
        if(!tank)return notify('Receiving tank not found','No inventory was changed. Review the delivery tank assignment.',true);
        if(tank.fuel!==d.fuelType)return notify('Fuel / tank mismatch','No inventory was changed. Correct the receiving tank configuration before approval.',true);
        if(!Number.isFinite(approvedQty)||approvedQty<=0)return notify('Approved volume required','Confirm a valid approved quantity in litres.',true);
        if(Math.abs(approvedQty-referenceQty)>tolerance&&!comments)return notify('Approval explanation required','Explain why the approved volume differs from the delivery note or measured exception receipt.',true);
        const projected=d.emergency?Number(d.postStock):Number((Number(d.preStock||0)+approvedQty).toFixed(1));
        if(projected<0||projected>Number(tank.capacity||0))return notify('Tank capacity exceeded',`The projected ${num(projected,1)} L balance exceeds the ${num(tank.capacity,0)} L capacity. No stock was posted.`,true);
        const txnId=reserveTransaction('delivery-decision',d.id,`approve ${approvedQty} L`);if(!txnId)return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);
        const posting=postDeliveryRefill(d,approvedQty,{at,actor:currentUser.name,measuredBalance:d.emergency?Number(d.postStock):null,postDipReading:d.postDipReading});
        if(!posting.ok){releaseTransaction(txnId);}
        if(!posting.ok)return notify(posting.duplicate?'Delivery already posted':'Unable to post delivery',posting.error||'No inventory was changed.',true);
        d.approvalDecision={decision,approver:currentUser.name,at,comments,approvedQty,postingId:posting.postingId};d.comments=comments;
        const preBalanceVariance=Number((Number(d.preStock)-Number(posting.systemBalanceBefore)).toFixed(1));
        if(Math.abs(preBalanceVariance)>tolerance)addDiscrepancy({type:'Pre-delivery balance difference',businessDate:d.businessDate,tankId:tank.id,recordId:d.id,variance:preBalanceVariance,expected:posting.systemBalanceBefore,physical:Number(d.preStock),tolerance,details:`Recorded pre-delivery tank volume ${num(d.preStock,1)} L differs from the prior stored tank balance ${num(posting.systemBalanceBefore,1)} L.`,explanation:comments||'Compare the pre-unload tank dip and prior balance.'});
        if(d.emergency){d.status='received';d.receivedAt=at;d.receivedBy=d.createdBy;d.receiptStatus='Exceptional receipt approved and posted';d.stockPosting.receiptActualQty=Number(d.actualQty||0);d.stockPosting.postDipReading=d.postDipReading??null;d.stockPosting.postVolume=Number(d.postStock);d.stockPosting.reconciledBalance=Number(d.postStock);d.stockPosting.receivedBy=d.createdBy;d.stockPosting.receivedAt=at;d.stockPosting.status='Receipt reconciled';const receivedDiff=Number((Number(d.actualQty)-approvedQty).toFixed(1)),measuredDiff=Number((Number(d.postStock)-Number(d.preStock)-approvedQty).toFixed(1));if(Math.abs(receivedDiff)>tolerance)addDiscrepancy({type:'Approved receipt quantity difference',businessDate:d.businessDate,tankId:tank.id,recordId:d.id,variance:receivedDiff,expected:approvedQty,physical:Number(d.actualQty),tolerance,details:`Exceptional actual receipt ${num(d.actualQty,1)} L differs from Manager-approved volume ${num(approvedQty,1)} L.`,explanation:comments||d.exceptionReason});if(Math.abs(measuredDiff)>tolerance)addDiscrepancy({type:'Delivery stock check',businessDate:d.businessDate,tankId:tank.id,recordId:d.id,variance:measuredDiff,expected:approvedQty,physical:Number(d.postStock)-Number(d.preStock),tolerance,details:`Exceptional measured tank increase ${num(Number(d.postStock)-Number(d.preStock),1)} L differs from Manager-approved refill ${num(approvedQty,1)} L.`,explanation:comments||d.exceptionReason});}
        else {d.status='approved_awaiting_receipt';d.receiptStatus='Approved volume posted · awaiting actual receipt and post-unload dip';}
        addAudit('Delivery approved and refill posted',d.id,`Pending · ${d.supplier} · DN ${d.deliveryNote} · ${d.fuelType} · tank ${d.tankId} · pre ${d.preDipReading==null?'dip not recorded':`${num(d.preDipReading,1)} cm`} / ${num(d.preStock,1)} L · prior system balance ${num(posting.systemBalanceBefore,1)} L`,`Approved ${num(approvedQty,1)} L · ${num(posting.previous,1)} L → ${num(posting.updated,1)} L · status ${deliveryStatusText(d)}`,`Manager ${currentUser.name} · ${at} · posting ${posting.postingId} · supplier note ${num(d.statedQty,1)} L · driver ${d.driver} · vehicle ${d.vehicle} · contact ${d.contact} · authorization ${d.exceptionAuthority||'—'} · ${comments||d.exceptionReason||'Quantity approved against delivery documentation'}`);
      }else{
        if(!reserveTransaction('delivery-decision',d.id,'reject'))return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);
        d.approvalDecision={decision,approver:currentUser.name,at,comments};d.comments=comments;d.status='rejected';d.receiptStatus='Rejected by authorized manager';
        addAudit('Delivery rejected',d.id,`Pending · ${d.supplier} · DN ${d.deliveryNote} · ${num(d.statedQty,1)} L · tank ${d.tankId}`,`Rejected · tank balance unchanged · status ${deliveryStatusText(d)}`,`Manager ${currentUser.name} · ${at} · ${comments}`);
      }
      saveState();modal=null;render();notify(`Delivery ${decision==='approve'?'approved':'rejected'}`,decision==='approve'?`${num(d.approvedQty,1)} L posted once to ${d.tankId}; ${d.emergency?'receipt already dip-reconciled.':'Supervisor must record actual receipt and the post-unload dip.'}`:`${d.id} rejected; inventory was not changed.`);
    }
    function decideMeter(form) {
      if(!isManager())return notify('Permission denied','Only an authorized manager can decide meter adjustment requests.',true);
      const r=state.meterRequests.find(x=>x.id===form.dataset.id);if(!r||r.status!=='pending')return notify('Request is no longer pending','Refresh the approval queue before acting.',true);
      if(r.createdBy===currentUser.name)return notify('Self-approval blocked','The requesting user cannot authorize their own meter adjustment.',true);
      const fd=new FormData(form),decision=form.dataset.decision,comments=String(fd.get('comments')||'').trim();if(decision==='reject'&&!comments)return notify('Rejection reason required','Enter a reason before rejecting.',true);
      if(!reserveTransaction('meter-decision',r.id,decision))return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);
      r.status=decision==='approve'?'Authorized':'Rejected';r.decision={decision,approver:currentUser.name,at:new Date().toISOString(),comments};
      if(decision==='approve')state.meterAdjustments.unshift({id:makeId('MAD'),requestId:r.id,nozzleId:r.nozzleId,businessDate:r.businessDate,shift:r.shift,oldReading:r.previousReading,newReading:r.newReading,reason:r.reason,authorizedBy:currentUser.name,authorizedAt:r.decision.at,status:'Authorized'});
      addAudit(`Meter adjustment ${decision==='approve'?'authorized':'rejected'}`,r.id,`${num(r.previousReading,1)} L`,decision==='approve'?`Authorized baseline ${num(r.newReading,1)} L`:'Rejected',comments||r.reason);
      saveState();modal=null;render();notify(`Meter request ${decision==='approve'?'authorized':'rejected'}`,`${r.nozzleId} adjustment decision was recorded.`);
    }
    function reviewDiscrepancy(form) {
      if(!isManager())return notify('Permission denied','Only an authorized manager can review discrepancies.',true);
      const d=state.discrepancies.find(x=>x.id===form.dataset.id);if(!d||d.status!=='Open')return notify('Discrepancy is no longer open','Refresh the page before acting.',true);
      const fd=new FormData(form),action=fd.get('action'),comment=String(fd.get('comment')||'').trim();if(!comment)return notify('Review notes required','Add the investigation basis before saving.',true);
      d.reviewedBy=currentUser.name;d.reviewedAt=new Date().toISOString();d.reviewComment=comment;
      if(action==='adjust'){
        if(!d.tankId)return notify('Adjustment not available','This discrepancy has no tank mapping.',true);
        const litres=Number(fd.get('litres'));if(!Number.isFinite(litres))return notify('Invalid adjustment','Enter a numeric adjustment quantity.',true);
        if(!reserveTransaction('discrepancy-review',d.id,`adjust ${litres} L`))return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);
        state.adjustments.unshift({id:makeId('ADJ'),tankId:d.tankId,businessDate:d.businessDate,litres,status:'Authorized',authorizedBy:currentUser.name,authorizedAt:d.reviewedAt,reason:comment,sourceDiscrepancy:d.id,originalVariance:d.variance});
        d.status='Resolved · adjustment authorized';d.adjustmentLitres=litres;
        addAudit('Stock adjustment authorized',d.tankId,`${signedLitres(d.variance)} variance`,`Adjustment ${signedLitres(litres)} · expected balance revised`,comment);
      } else {if(!reserveTransaction('discrepancy-review',d.id,'no adjustment'))return notify('Already processed','This operation was already recorded once (unique transaction ID). It cannot be applied twice.',true);d.status='Reviewed · no adjustment';addAudit('Discrepancy reviewed',d.id,'Open','Reviewed · no stock adjustment',comment);}
      saveState();modal=null;render();notify('Manager review saved',`${d.id} remains in the audit trail.`);
    }
    function decideDeposit(form) {
      if(!isManager())return notify('Permission denied','Only an authorized manager can approve or reject deposits.',true);
      const d=state.deposits.find(x=>x.id===form.dataset.id);
      if(!d||d.workflow!==DEPOSIT_WORKFLOW||d.status!=='Pending manager approval')return notify('Deposit already reviewed','Refresh the approval queue before acting.',true);
      const fd=new FormData(form),decision=form.dataset.decision,comments=String(fd.get('comments')||'').trim(),target=dailyMetrics(d.businessDate).sales;
      if(!['approve','reject'].includes(decision))return notify('Decision not recognized','Choose approve or reject.',true);
      if(decision==='reject'&&!comments)return notify('Rejection reason required','Enter the correction needed before rejecting this deposit.',true);
      if(decision==='approve'&&amountBanked(d.businessDate)+Number(d.amount)-target>0.005)return notify('Exceeds the sales value',`Approving ${money(d.amount)} would take approved banking above the ${money(target)} sales value for ${dateShort(d.businessDate)}. Reject it and ask the Supervisor to resubmit the correct amount.`,true);
      if(!reserveTransaction('deposit-decision',d.id,decision))return notify('Already processed','This deposit decision was already recorded once (unique transaction ID).',true);
      const at=new Date().toISOString();
      d.status=decision==='approve'?'Approved':'Rejected';d.approvalDecision={decision,approver:currentUser.name,at,comments};d.reviewComments=comments;
      if(decision==='approve'){d.approvedBy=currentUser.name;d.approvedAt=at;}
      addAudit(`Bank deposit ${decision==='approve'?'approved':'rejected'}`,d.id,'Pending manager approval',d.status,comments||`Bank receipt ${d.receipt} checked against ${money(target)} sales target`);
      const after=depositStatus(d.businessDate);
      saveState();modal=null;render();notify(`Deposit ${decision==='approve'?'approved':'rejected'}`,decision==='approve'?(after.fullyBanked?`${dateShort(d.businessDate)} is now fully banked and reconciled against meter sales.`:`${money(d.amount)} confirmed. ${money(after.outstanding)} of ${money(after.due)} is still outstanding for ${dateShort(d.businessDate)}.`):'The Supervisor can submit a corrected deposit with new receipt details.');
    }

    function handleSubmit(event) {
      const form=event.target;
      // Never allow a native browser submission: every form in this app is handled in-page.
      // A missed id here previously fell through to a real GET request — a full, unwanted page reload.
      event.preventDefault();
      lastSubmitKey=formDraftKey(form);
      if(modal&&modal.error&&form.closest('.modal'))modal.error=null;
      if(form.id==='company-profile-form'){return saveCompanyProfile(form);}
      if(form.id==='setup-form'){event.preventDefault();completeSetup(form);return;}
      if(form.id==='setup-restore-form'){event.preventDefault();restoreFromSetup(form);return;}
      if(form.id==='login-form'){
        event.preventDefault();if(bootRestorePending)return notify('Restore is still running','Wait for the saved workspace check to finish before signing in.');const fd=new FormData(form);login(fd.get('username')||'',fd.get('password')||'');return;
      }
      if(form.id==='station-create-form'){event.preventDefault();return createStation(form);}
      if(form.id==='global-price-form'){event.preventDefault();return saveGlobalPrices(form);}
      if(form.classList&&form.classList.contains('station-capacity-form')){event.preventDefault();return saveStationTankConfiguration(form);}
      if(form.classList&&form.classList.contains('station-identity-form')){event.preventDefault();return saveStationIdentity(form);}
      if(form.classList&&form.classList.contains('station-pump-form')){event.preventDefault();return saveStationPumpCount(form);}
      if(form.classList&&form.classList.contains('station-assignment-form')){event.preventDefault();return saveStationAssignments(form);}
      if(form.id==='station-setup-form'){event.preventDefault();return saveDispenserCount(form);}
      if(form.id==='supervisor-form'){event.preventDefault();return createSupervisor(form);}
      if(form.id==='retention-form'){event.preventDefault();return saveRetentionSettings(form);}
      if(!form.closest('.modal'))return;
      event.preventDefault();
      if(form.id==='delivery-form')return createDelivery(form);
      if(form.id==='receipt-form')return completeReceipt(form);
      if(form.id==='reading-form')return submitReading(form);
      if(form.id==='stock-reading-form')return saveStockReading(form);
      if(form.id==='deposit-form')return saveDeposit(form);
      if(form.id==='maintenance-form')return submitMaintenance(form);
      if(form.id==='meter-request-form')return submitMeterRequest(form);
      if(form.id==='price-request-form')return submitPriceRequest(form);
      if(form.id==='delivery-decision-form')return decideDelivery(form);
      if(form.id==='meter-decision-form')return decideMeter(form);
      if(form.id==='price-decision-form')return decidePrice(form);
      if(form.id==='discrepancy-form')return reviewDiscrepancy(form);
      if(form.id==='deposit-decision-form')return decideDeposit(form);
      if(form.id==='automatic-backup-restore-form')return restoreAutomaticBackup(form);
      if(form.id==='full-backup-import-form')return importFullBackup(form);
      if(form.id==='data-reset-form'){const fd=new FormData(form);if(fd.get('confirm')!=='on')return notify('Confirmation required','Confirm that this reset affects the active station only.',true);return resetStationData();}
      if(form.id==='delete-supervisor-form')return deleteSupervisor(form);
      if(form.id==='change-password-form')return changeOwnPassword(form);
      if(form.id==='reset-password-form')return resetSupervisorPassword(form);
      if(form.id==='backup-import-form')return importStationBackup(form);
    }

    function refreshClockAndDepositNotifications() {
      const now=new Date(),today=localDateIso(now);
      let dateChanged=false;
      if(today!==TODAY){
        const oldToday=TODAY;
        TODAY=today;YESTERDAY=shiftDate(TODAY,-1);
        if(readingDate===oldToday)readingDate=TODAY;
        if(reportDate===oldToday)reportDate=TODAY;
        dateChanged=true;
      }
      const nextDefaultDepositDate=activeDepositBusinessDate(now);
      if(nextDefaultDepositDate!==defaultDepositDate){
        if(depositDateFilter===defaultDepositDate)depositDateFilter=nextDefaultDepositDate;
        defaultDepositDate=nextDefaultDepositDate;dateChanged=true;
      }
      if(!currentUser){if(dateChanged)queueRender();return;}
      if(!isSupervisor()){if(dateChanged)queueRender();return;}
      maybeShowBankingAlert();
      const tasks=depositReminderTasks(now);
      const pending=state.deposits.filter(d=>d.workflow===DEPOSIT_WORKFLOW&&d.status==='Pending manager approval');
      const signature=[...tasks.map(task=>`${task.businessDate}:${task.summary.status}:${task.summary.due.toFixed(2)}`),...pending.map(deposit=>`${deposit.businessDate}:pending:${deposit.id}`)].sort().join('|');
      const changed=signature!==lastDepositReminderSignature;
      if(changed||dateChanged){lastDepositReminderSignature=signature;queueRender();}
      flushDeferredRender();
      const todayCloseTask=tasks.find(task=>task.businessDate===today&&now.getTime()>=depositCloseAt(today).getTime());
      const morningDeadlineTask=tasks.find(task=>task.summary.deadlineDate===today&&task.summary.status==='Overdue');
      const announceTask=todayCloseTask||morningDeadlineTask;
      if(changed&&announceTask){
        const phase=todayCloseTask?'close':'deadline';
        const key=`${announceTask.businessDate}:${phase}`;
        if(lastDepositReminderToast!==key){
          lastDepositReminderToast=key;
          notify(todayCloseTask?'9:00 pm sales close · deposit reminder':'10:00 am deposit deadline missed',todayCloseTask?`${money(announceTask.summary.due)} for ${num(announceTask.metrics.litres,1)} L sold is due at the bank by 10:00 am tomorrow. Submit the receipt details for Manager approval.`:`${money(announceTask.summary.due)} for ${dateShort(announceTask.businessDate)} is overdue. Submit the full-sales deposit details with a late explanation.`);
        }
      }
    }
    setInterval(refreshClockAndDepositNotifications,30000);

    document.addEventListener('click',handleClick);
    document.addEventListener('input',handleInput);
    document.addEventListener('change',handleChange);
    document.addEventListener('submit',handleSubmit);
    document.addEventListener('keydown',paletteKeys,true);
    // Flush queued background renders once the user finishes with a control (e.g. closes a select).
    document.addEventListener('focusout',()=>{setTimeout(flushDeferredRender,80);});
    document.addEventListener('pointerup',()=>{setTimeout(flushDeferredRender,120);});

    // Saves are committed to IndexedDB immediately after each change, so nothing depends on unload events.
    // When the tab is hidden we only take an opportunistic recovery point; it is never relied upon.
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&autosaveRuntime.ready&&autosaveRuntime.indexedDB)maybeSnapshot().catch(()=>{});});

    // Saved records persist between visits in this browser; clearing a station is an explicit Manager action.
    document.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      if(modal){closeModal();return;}
      if(notificationsOpen){notificationsOpen=false;render();const bell=document.querySelector('[data-action="notifications"]');if(bell)bell.focus();return;}
      if(drawerOpen){setDrawer(false);const toggle=document.querySelector('[data-action="toggle-drawer"]');if(toggle)toggle.focus();}
    });
    render();
    requestPersistentBrowserStorage();
    initializeAutosaveRecovery().catch(error=>{bootRestorePending=false;autosaveRuntime.ready=true;autosaveRuntime.indexedDB=false;secureUserDirectory().catch(()=>{});setSaveStatus('unavailable',`The local database could not be opened: ${String(error&&error.message||error)}. Records are not being saved.`);render();notify('Local database error',`Records cannot be saved: ${String(error&&error.message||error)}`,true);});
  })();
  