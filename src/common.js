const crypto = require('node:crypto');

const STOCK = Object.freeze({ 'SKU-AVAILABLE': 10, 'SKU-LIMITED': 1 });

function reserve(sku, quantity) {
  const available = STOCK[sku] ?? 0;
  if (quantity < 1 || !Number.isInteger(quantity)) {
    return { reserved: false, reservationId: '', error: 'invalid_argument', available };
  }
  if (available < quantity) {
    return { reserved: false, reservationId: '', error: 'out_of_stock', available };
  }
  return {
    reserved: true,
    reservationId: `res-${crypto.randomUUID()}`,
    error: '',
    available
  };
}

module.exports = { STOCK, reserve };
