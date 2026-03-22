// ========== GLOBAL STATE ==========
// Centralised state object shared across all modules
window.GAILS = window.GAILS || {};

window.GAILS.state = {
  ALL: [],           // all processed records
  MONTHS: [],        // ordered month labels like "Mar 25"
  BAKERIES: [],      // unique bakery names
  selectedMonths: [],
  searchBakery: '',
  bandFilter: '',
  regionFilter: '',
  opsFilter: '',
  PERIODS: {},
};
