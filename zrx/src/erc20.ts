import "allocator/arena";

import { Transfer as TransferEvent } from "../types/ERC20/ERC20";
import { User } from "../types/schema";
import { store, BigInt } from "@graphprotocol/graph-ts";

export function transferHandler(event: TransferEvent): void {
  let fromAddr = event.params.from;
  let toAddr = event.params.to;
  let amount = event.params.value;

  let fromUser = (store.get("User", fromAddr.toHex()) as User) || new User();
  let toUser = (store.get("User", toAddr.toHex()) as User) || new User();

  fromUser.address = fromAddr;

  fromUser.balance = fromUser.balance || new BigInt();
  fromUser.balance = fromUser.balance.minus(amount);

  toUser.address = toAddr;

  toUser.balance = toUser.balance || new BigInt();
  toUser.balance = toUser.balance.plus(amount);

  store.set("User", fromUser.address.toHex(), fromUser);
  store.set("User", toUser.address.toHex(), toUser);
}

// @ts-ignore
export { allocate_memory };
