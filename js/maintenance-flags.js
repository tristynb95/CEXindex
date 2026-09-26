// ========== MAINTENANCE FLAGS ==========
// The quick options for a check-in's "Maintenance To Flag" field, grouped by
// the kit they belong to. The Log Visit form lists them, the visit report
// groups a visit's flags under these headings, and the Cowork snapshot
// (tools/cowork-snapshot) tags each exported flag with its group. Anything a
// user typed in by hand falls under "Other".
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  var GROUPS = [
    ['Grinder', [
      'Clump Crusher (House Blend)',
      'Clump Crusher (Decaf)',
      'Clump Crusher (Multiple)',
      'Grinder Externals',
      'Grinder Chute',
      'Grinder Burrs (House Blend)',
      'Grinder Burrs (Decaf)',
      'Grinder Burrs (Multiple)',
      'Grinder (Out of Service)',
      'Grinder Hopper (Broken)',
      'Grinder (Coffee Clumping)'
    ]],
    ['Espresso machine', [
      'Basket Springs',
      'Group Gaskets',
      'Diffusion Screens & Plates',
      'Portafilters',
      'Baskets',
      'Boiler Pressure (Too High)',
      'Boiler Pressure (Too Low)',
      'Steam Pressure (Too High)',
      'Steam Pressure (Too Low)',
      'Steamwands',
      'Brew Boiler (Too Hot)',
      'Brew Boiler (Too Cool)',
      'Espresso Machine Externals',
      'Espresso Machine (Out of Service)',
      'Espresso Machine Buttons (Not Working)',
      'Espresso Machine (Leaking)'
    ]],
    ['Hot water', [
      'Water Filter',
      'Hot Water Tap (Temperature)',
      'Hot Water Tap (Water Level)',
      'Hot Water Tap (Out of Service)',
      'Hot Water Boiler (Leaking)'
    ]],
    ['Filter coffee', [
      'Filter Coffee (Settings)',
      'Filter Coffee (General)',
      'Filter Coffee (Extraction)'
    ]],
    ['Bar equipment', [
      'Easycream Temperature',
      'Bench Scales (Broken or Need More)',
      'Pocket Scales (Broken or Need More)',
      'Spares (Stock up)',
      'Jugs (Order More)',
      'Jugs (Heavy Build Up)',
      'Jugs (Labelling)',
      'Knock Box (Broken or Worn)',
      'KVlink (Not Working)',
      'Pitcher Rinser (Broken)'
    ]],
    ['Ice machine', [
      'Ice Machine (Out of Service)',
      'Ice Machine (Out of Ice)',
      'Ice Machine (Cleaning)'
    ]],
    ['General', [
      'General Cleanliness',
      'Waste Pipe (Leaking)'
    ]]
  ];

  var OTHER = 'Other';

  // [{ name, group }] in list order.
  function options() {
    return GROUPS.reduce(function (list, group) {
      return list.concat(group[1].map(function (name) {
        return { name: name, group: group[0] };
      }));
    }, []);
  }

  // Group headings in list order ("Other" is not included).
  function groups() {
    return GROUPS.map(function (group) { return group[0]; });
  }

  // A saved flag as { name, group }: the quick option's own spelling when it
  // matches one (ignoring case), otherwise the text as typed under "Other".
  function classify(flag) {
    var text = String(flag == null ? '' : flag).trim();
    var key = text.toLowerCase();
    var match = options().filter(function (option) {
      return option.name.toLowerCase() === key;
    })[0];
    return match || { name: text, group: OTHER };
  }

  window.GAILS.MaintenanceFlags = {
    options: options,
    groups: groups,
    classify: classify,
    OTHER: OTHER
  };
})();
