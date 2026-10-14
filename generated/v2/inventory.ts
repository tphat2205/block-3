import type * as grpc from '@grpc/grpc-js';
import type { MessageTypeDefinition } from '@grpc/proto-loader';

import type { InventoryClient as _inventory_InventoryClient, InventoryDefinition as _inventory_InventoryDefinition } from './inventory/Inventory';

type SubtypeConstructor<Constructor extends new (...args: any) => any, Subtype> = {
  new(...args: ConstructorParameters<Constructor>): Subtype;
};

export interface ProtoGrpcType {
  inventory: {
    Inventory: SubtypeConstructor<typeof grpc.Client, _inventory_InventoryClient> & { service: _inventory_InventoryDefinition }
    ReserveReply: MessageTypeDefinition
    ReserveRequest: MessageTypeDefinition
  }
}

