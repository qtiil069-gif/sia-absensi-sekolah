/* Dashboard statistics and accessible chart rendering. */
(() => {
  'use strict';
  const { byId, element, formatDate } = window.SIA.dom;
  const statuses = [
    ['H', 'Hadir', '#73a99b'], ['S', 'Sakit', '#edc063'],
    ['I', 'Izin', '#8eb3d0'], ['A', 'Alfa', '#e69c7e']
  ];
  function renderDashboard(data) {
    byId('stat-students').textContent = data.stats.students.toLocaleString('id-ID');
    byId('stat-classes').textContent = data.stats.classes;
    byId('stat-attendance').textContent = data.stats.attendanceRate === null ? '—' : `${data.stats.attendanceRate}%`;
    byId('stat-sessions').textContent = `${data.stats.sessions} sesi absensi`;
    byId('stat-journals').textContent = data.stats.journals;
    byId('data-scope').textContent = `${data.scope} · ${formatDate(data.date)}`;
    const chart = byId('weekly-chart');
    chart.replaceChildren();
    data.weekly.forEach((day) => {
      const label = new Date(`${day.date}T12:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' });
      const column = element('div', undefined, 'bar-column');
      column.setAttribute('aria-label', `${label}, ${day.date}: ${day.rate === null ? 'belum ada catatan' : `${day.rate}% hadir dari ${day.total} catatan`}`);
      const track = element('div', undefined, 'bar-track');
      const fill = element('div', undefined, 'bar-fill');
      fill.style.height = `${day.rate === null ? 0 : Math.min(100, Math.max(0, day.rate))}%`;
      if (day.rate === null) fill.style.background = '#e4e8dd';
      track.append(fill);
      column.append(element('span', day.rate === null ? '—' : `${day.rate}%`, 'bar-value'), track, element('span', label, 'bar-label'));
      chart.append(column);
    });
    const { counts, rate, total } = data.composition;
    const legend = byId('composition-legend');
    legend.replaceChildren();
    let position = 0;
    const gradient = statuses.map(([code, label, color]) => {
      const count = counts[code];
      const percent = total ? count / total * 100 : 0;
      const stop = `${color} ${position}% ${position + percent}%`;
      position += percent;
      const item = element('li');
      const dot = element('span', undefined, 'legend-dot');
      dot.style.background = color;
      const value = element('strong', `${total ? Math.round(percent) : 0}% `);
      value.append(element('span', `(${count})`, 'legend-count'));
      item.append(dot, element('span', label), value);
      legend.append(item);
      return stop;
    });
    byId('donut').style.background = total ? `conic-gradient(${gradient.join(',')})` : '#e9ece4';
    byId('donut').setAttribute('aria-label', total ? `${rate}% hadir dari ${total} catatan absensi` : 'Belum ada catatan absensi');
    byId('donut-rate').textContent = rate === null ? '—' : `${rate}%`;
    byId('composition-note').textContent = total ? `${total} catatan siswa-sesi · siswa dapat tercatat pada beberapa sesi.` : 'Belum ada catatan absensi pada tanggal ini. Tidak dihitung sebagai alfa.';
  }

  window.SIA.components.renderDashboard = renderDashboard;
})();
