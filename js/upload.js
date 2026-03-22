// ========== UPLOAD MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.initUpload = function(initDashboard) {
  var G = GAILS;
  window.GAILS_initDashboard = initDashboard; // EXPOSED for Firebase loading
  var uploadZone = document.getElementById('uploadZone');
  var fileInput = document.getElementById('fileInput');
  var uploadStatus = document.getElementById('uploadStatus');

  document.getElementById('browseBtn').addEventListener('click', function() { fileInput.click(); });
  fileInput.addEventListener('change', function(e) { if (e.target.files[0]) handleFile(e.target.files[0]); });

  uploadZone.addEventListener('dragover', function(e) { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', function() { uploadZone.classList.remove('drag-over'); });
  uploadZone.addEventListener('drop', function(e) {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  document.getElementById('reloadBtn').addEventListener('click', function() {
    document.getElementById('dashboardContent').style.display = 'none';
    document.getElementById('uploadZone').style.display = '';
    uploadStatus.textContent = '';
    uploadStatus.className = 'status';
    fileInput.value = '';
    localStorage.removeItem('gails_excel_data');
    localStorage.removeItem('gails_excel_name');
  });

  // Auto-load from localStorage
  var saved = localStorage.getItem('gails_excel_data');
  var savedName = localStorage.getItem('gails_excel_name');
  if (saved) {
    try {
      var binary = atob(saved);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var result = G.parseExcelFile(bytes);
      if (result.records.length > 0) {
        uploadStatus.textContent = 'Restored ' + result.records.length + ' records from session (' + (savedName || 'saved file') + ')';
        uploadStatus.className = 'status success';
        setTimeout(function() { initDashboard(result.records, result.months); }, 200);
        return;
      }
    } catch (e) {
      console.warn('Could not restore session data:', e);
      localStorage.removeItem('gails_excel_data');
      localStorage.removeItem('gails_excel_name');
    }
  }

  function handleFile(file) {
    if (!file.name.match(/\.xlsx?$/i)) {
      uploadStatus.textContent = 'Please select an .xlsx file';
      uploadStatus.className = 'status error';
      return;
    }
    uploadStatus.textContent = 'Processing ' + file.name + '...';
    uploadStatus.className = 'status';

    var reader = new FileReader();
    reader.onload = function(e) {
      try {
        var data = new Uint8Array(e.target.result);
        var result = G.parseExcelFile(data);
        if (result.records.length === 0) {
          uploadStatus.textContent = 'No data found. Check the spreadsheet format.';
          uploadStatus.className = 'status error';
          return;
        }
        try {
          var bin = '';
          for (var i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
          localStorage.setItem('gails_excel_data', btoa(bin));
          localStorage.setItem('gails_excel_name', file.name);
          
          if (window.GAILS_Firebase) {
             window.GAILS_Firebase.saveData(result.records, result.months);
          }
        } catch (storageErr) {
          console.warn('Could not save to localStorage:', storageErr);
        }
        uploadStatus.textContent = 'Loaded ' + result.records.length + ' records across ' + result.months.length + ' months';
        uploadStatus.className = 'status success';
        setTimeout(function() { initDashboard(result.records, result.months); }, 400);
      } catch (err) {
        uploadStatus.textContent = 'Error: ' + err.message;
        uploadStatus.className = 'status error';
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }
};
