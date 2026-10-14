// Original file: proto/v2/inventory.proto


export interface ReserveReply {
  'reserved'?: (boolean);
  'reservationId'?: (string);
  'available'?: (number);
  '_available'?: "available";
}

export interface ReserveReply__Output {
  'reserved': (boolean);
  'reservationId': (string);
  'available'?: (number);
  '_available'?: "available";
}
