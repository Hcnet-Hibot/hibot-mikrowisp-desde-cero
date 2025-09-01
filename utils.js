// utils.js
function limpiarNumeroEcuador(input) {
  if (!input) return null;
  let digits = String(input).replace(/\D+/g, '');

  // Quitar ceros y prefijos redundantes
  if (digits.startsWith('00')) digits = digits.slice(2); // 00 593...
  if (digits.startsWith('0') && digits.length === 10) {
    // 09xxxxxxxx -> 5939xxxxxxxx / 02xxxxxxx -> 5932xxxxxxx
    digits = '593' + digits.slice(1);
  }
  if (digits.startsWith('593') && digits.length === 13 && digits[3] === '0') {
    // 5930xxxxxxxx -> corregir si vino con 0 extra tras 593
    digits = '593' + digits.slice(4);
  }
  // Añadir 593 si vino local sin 0 (raro, pero pasa)
  if (!digits.startsWith('593') && (digits.length === 9 || digits.length === 10)) {
    digits = '593' + digits;
  }

  // Validación final: 12 dígitos y prefijo 593
  if (!digits.startsWith('593') || digits.length !== 12) return null;
  return digits;
}

module.exports = { limpiarNumeroEcuador };
