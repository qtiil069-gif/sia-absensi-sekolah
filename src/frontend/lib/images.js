(() => {
  const { element } = window.SIA.dom;
  const { button } = window.SIA.forms;
  async function resizeImage(file, logo) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Pilih JPG, PNG, atau WebP maksimal 5 MB.');
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      image.src = url;
      await image.decode();
      let width = Math.min(logo ? 320 : 480, image.naturalWidth);
      let height = Math.round(width * image.naturalHeight / image.naturalWidth);
      if (height > 640) { width = Math.round(width * 640 / height); height = 640; }
      const canvas = document.createElement('canvas');
      for (let attempt = 0; attempt < 12; attempt++) {
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!logo) { context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height); }
        context.drawImage(image, 0, 0, width, height);
        const value = logo ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', Math.max(.35, .85 - attempt * .07));
        if (value.length <= 37300) return value;
        width = Math.max(60, Math.round(width * .85)); height = Math.max(60, Math.round(height * .85));
      }
      throw new Error('Gambar terlalu besar setelah diperkecil. Pilih gambar lain.');
    } finally { URL.revokeObjectURL(url); }
  }
  function imageField(label, initial = '', logo = false) {
    const node = element('div', undefined, 'image-field form-field');
    const input = element('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.setAttribute('aria-label', label);
    const preview = element('img'); preview.alt = label;
    let data = initial; let error = null; let pending = Promise.resolve();
    const info = element('span', logo ? 'Gunakan PNG atau WebP transparan. Transparansi dipertahankan; latar logo lama tidak dihapus otomatis.' : 'Gambar diperkecil sebelum disimpan; metadata foto tidak disertakan.');
    const render = () => { preview.hidden = !data; if (data) preview.src = data; else preview.removeAttribute('src'); };
    node.append(element('span', label), preview, input, button('Hapus ' + label.toLowerCase(), () => { data = ''; error = null; input.value = ''; render(); }), info);
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      info.textContent = 'Memproses gambar…';
      pending = resizeImage(file, logo).then((value) => { data = value; error = null; info.textContent = 'Gambar siap disimpan.'; render(); })
        .catch((reason) => { error = reason; info.textContent = reason.message; });
    });
    render();
    return { node, value: () => data, ready: async () => { await pending; if (error) throw error; } };
  }
  window.SIA.images = { resizeImage, imageField };
})();
