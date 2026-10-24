/* Transport adapter: explicit local demo or Apps Script RPC; never automatic fallback. */
(() => {
  'use strict';
  const preview = window.SIA_PREVIEW === true;
  function rpc(name, args) {
    if (preview) return window.SIA_DEMO.call(name, args);
    return new Promise((resolve, reject) => {
      if (!window.google?.script?.run) {
        reject(new Error('Buka aplikasi melalui Apps Script atau gunakan npm run dev untuk mode demo.'));
        return;
      }
      const runner = google.script.run.withSuccessHandler((result) => {
        if (result?.ok) resolve(result.data);
        else { const error = new Error(result?.error?.message || 'Respons layanan tidak valid.'); error.code = result?.error?.code; reject(error); }
      }).withFailureHandler(() => reject(new Error('Koneksi Apps Script gagal. Silakan coba lagi.')));
      const allowed = ['getBootstrap', 'getDashboard', 'listClasses', 'listStudents', 'getRosterOptions',
        'createClass', 'updateClass', 'deactivateClass', 'queryStudents', 'createStudent', 'updateStudent', 'deactivateStudent',
        'getAttendanceOptions', 'getAttendance', 'saveAttendance', 'getSchoolSettings', 'updateSchoolSettings', 'getStage3Status', 'migrateStage3', 'prepareStudentCards', 'exportStudentData', 'validateStudentQr', 'saveQrAttendance'];
      if (!allowed.includes(name)) return reject(new Error('Fungsi tidak dikenal.'));
      if (args === undefined) runner[name]();
      else runner[name](args);
    });
  }

  window.SIA.api = { preview, rpc };
})();
