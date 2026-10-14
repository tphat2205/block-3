// Original file: proto/v2/inventory.proto

import type * as grpc from '@grpc/grpc-js'
import type { MethodDefinition } from '@grpc/proto-loader'
import type { ReserveReply as _inventory_ReserveReply, ReserveReply__Output as _inventory_ReserveReply__Output } from '../inventory/ReserveReply';
import type { ReserveRequest as _inventory_ReserveRequest, ReserveRequest__Output as _inventory_ReserveRequest__Output } from '../inventory/ReserveRequest';

export interface InventoryClient extends grpc.Client {
  Reserve(argument: _inventory_ReserveRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  Reserve(argument: _inventory_ReserveRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  Reserve(argument: _inventory_ReserveRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  Reserve(argument: _inventory_ReserveRequest, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  reserve(argument: _inventory_ReserveRequest, metadata: grpc.Metadata, options: grpc.CallOptions, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  reserve(argument: _inventory_ReserveRequest, metadata: grpc.Metadata, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  reserve(argument: _inventory_ReserveRequest, options: grpc.CallOptions, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  reserve(argument: _inventory_ReserveRequest, callback: grpc.requestCallback<_inventory_ReserveReply__Output>): grpc.ClientUnaryCall;
  
}

export interface InventoryHandlers extends grpc.UntypedServiceImplementation {
  Reserve: grpc.handleUnaryCall<_inventory_ReserveRequest__Output, _inventory_ReserveReply>;
  
}

export interface InventoryDefinition extends grpc.ServiceDefinition {
  Reserve: MethodDefinition<_inventory_ReserveRequest, _inventory_ReserveReply, _inventory_ReserveRequest__Output, _inventory_ReserveReply__Output>
}
