(function () {
  'use strict';
  var form = document.getElementById('form_board');
  if (!form) return;
  var all = document.getElementById('agree-all');
  var names = ['agree', 'agree2'];
  var confirmation = document.getElementById('agree5');
  var error = document.getElementById('agreement-error');
  function sync() {
    var count = 0;
    names.forEach(function (name) {
      var selected = form.querySelector('input[name="' + name + '"]:checked');
      if (selected && selected.value === '1') count++;
    });
    all.checked = count === names.length;
    all.indeterminate = count > 0 && count < names.length;
    document.getElementById('agree-count').textContent = count + ' / ' + names.length;
    confirmation.value = all.checked ? '동의합니다' : '';
    confirmation.readOnly = all.checked;
  }
  all.addEventListener('change', function () {
    var checked = all.checked;
    names.forEach(function (name) {
      var radios = form.querySelectorAll('input[name="' + name + '"]');
      Array.prototype.forEach.call(radios, function (radio) {
        radio.checked = checked && radio.value === '1';
      });
    });
    error.textContent = '';
    sync();
  });
  form.addEventListener('change', function (event) {
    if (event.target.type === 'radio') { error.textContent = ''; sync(); }
  });
  form.addEventListener('submit', function (event) {
    error.textContent = '';
    for (var i = 0; i < names.length; i++) {
      var radio = document.getElementById(names[i]);
      if (!radio.checked) {
        event.preventDefault();
        error.textContent = document.getElementById(names[i] + '-title').textContent.replace('필수', '').trim() + '에 동의해 주세요.';
        radio.focus();
        return;
      }
    }
    if (confirmation.value !== '동의합니다') {
      event.preventDefault(); error.textContent = '동의합니다를 정확하게 입력해 주세요.'; confirmation.focus(); return;
    }
    var writer = document.getElementById('writer');
    if (!writer.value.trim()) {
      event.preventDefault(); error.textContent = '성명을 입력해 주세요.'; writer.focus();
    }
  });
  window.addEventListener('pageshow', sync);
  sync();
})();
