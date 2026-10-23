/** Server-side role gate; deployment/Workspace integration still needs real-account tests. */
function authorize_() {
  var email = Session.getActiveUser().getEmail();
  if (!email) fail_('UNAUTHENTICATED', 'Identitas Google tidak tersedia. Masuk dengan akun yang diizinkan.');
  var context = { book: openDatabase_(), cache: {} };
  var users = rows_(context, 'Pengguna').filter(function (user) {
    return String(user.email).trim().toLowerCase() === email.trim().toLowerCase();
  });
  if (users.length !== 1 || !isActive_(users[0].aktif) ||
      ['ADMIN_KEPALA_SEKOLAH', 'GURU'].indexOf(users[0].role) === -1 || !users[0].user_id) {
    fail_('FORBIDDEN', 'Akun belum terdaftar aktif atau role tidak diizinkan. Hubungi administrator.');
  }
  context.user = users[0];
  if (rows_(context, 'Pengguna').filter(function (user) { return user.user_id === context.user.user_id; }).length !== 1) {
    fail_('FORBIDDEN', 'ID akun tidak unik. Hubungi administrator.');
  }
  return context;
}
