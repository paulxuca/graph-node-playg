import "allocator/arena";

import { Transfer as TransferEvent, ERC721 } from "../types/ERC721/ERC721";
import {
  User,
  Transaction,
  TokenContract,
  Token,
  TokenContractUser
} from "../types/schema";
import { store, ByteArray, Bytes } from "@graphprotocol/graph-ts";

export function transferHandler(event: TransferEvent): void {
  // Init event params
  let fromAddress = event.params.from;
  let toAddress = event.params.to;
  let tokenId = event.params.tokenId;

  // Init constants
  let tokenContract = ERC721.bind(event.address);

  let fromUser = (store.get("User", fromAddress.toHex()) as User) || new User();
  let toUser = (store.get("User", toAddress.toHex()) as User) || new User();

  fromUser.address = fromAddress;
  fromUser.id = fromAddress.toHex();

  toUser.address = toAddress;
  toUser.id = toAddress.toHex();

  store.set("User", fromUser.address.toHex(), fromUser);
  store.set("User", toUser.address.toHex(), toUser);

  let tokenContractEntity = store.get(
    "TokenContract",
    tokenContract._address.toHex()
  ) as TokenContract;

  // Create TokenContract entity if not exists.
  if (!tokenContractEntity) {
    tokenContractEntity = new TokenContract();

    tokenContractEntity.address = tokenContract._address;
    tokenContractEntity.id = tokenContract._address.toHex();

    store.set(
      "TokenContract",
      tokenContract._address.toHex(),
      tokenContractEntity
    );
  }

  let tokenEntity = store.get("Token", tokenId.toString()) as Token;

  // Creates Token if not exists.
  if (!tokenEntity) {
    tokenEntity = new Token();

    let tokenEntityId = concat(tokenId, tokenContract._address).toHex();

    tokenEntity.id = tokenEntityId;

    tokenEntity.tokenId = tokenId;
    tokenEntity.tokenContractAddress = tokenContractEntity.address;
    tokenEntity.tokenContract = tokenContractEntity.id;
    tokenEntity.transactions = [];
  }

  // Update owner of token.
  tokenEntity.owner = toUser.id;
  tokenEntity.ownerAddress = toUser.address;

  // Add the transaction to the list of transactions on this token.
  tokenEntity.transactions.push(event.transaction.hash.toHex());

  store.set("Token", tokenEntity.id, tokenEntity);

  // Manage TokenContractUser here.
  // The TokenContractUser is a concat of token contract address + user address
  let toUserTokenContractUserId = concat(
    tokenContract._address,
    toUser.address as Bytes
  ).toHex();

  let toUserTokenContractUser = store.get(
    "TokenContractUser",
    toUserTokenContractUserId
  ) as TokenContractUser;

  if (!toUserTokenContractUser) {
    toUserTokenContractUser = new TokenContractUser();

    toUserTokenContractUser.tokens = [tokenEntity.id];
    toUserTokenContractUser.id = toUserTokenContractUserId;
    toUserTokenContractUser.tokenContract = tokenContractEntity.id;
    toUserTokenContractUser.user = toUser.id;
    toUserTokenContractUser.userAddress = toUser.address;
  } else {
    toUserTokenContractUser.tokens.push(tokenEntity.id);
  }

  store.set(
    "TokenContractUser",
    toUserTokenContractUser.id,
    toUserTokenContractUser
  );

  let fromUserTokenContractUserId = concat(
    tokenContract._address,
    fromUser.address as Bytes
  ).toHex();

  let fromUserTokenContractUser = store.get(
    "TokenContractUser",
    fromUserTokenContractUserId
  ) as TokenContractUser;

  // Assume all events are synced on chain in order.
  // Only care about removing this record if it's safe to remove.
  if (fromUserTokenContractUser) {
    fromUserTokenContractUser.tokens = fromUserTokenContractUser.tokens || [];

    fromUserTokenContractUser.tokens = removeStringFromArray(
      fromUserTokenContractUser.tokens,
      tokenEntity.id
    );

    if (fromUserTokenContractUser.tokens.length === 0) {
      store.remove("TokenContractUser", fromUserTokenContractUser.id);
    } else {
      store.set(
        "TokenContractUser",
        fromUserTokenContractUser.id,
        fromUserTokenContractUser
      );
    }
  }

  // Handle transaction.
  let transaction = new Transaction();

  transaction.id = event.transaction.hash.toHex();
  transaction.sender = fromUser.id;
  transaction.senderAddress = fromUser.address;

  transaction.receiver = toUser.id;
  transaction.receiverAddress = toUser.address;

  transaction.token = tokenId.toString();
  transaction.gasUsed = event.transaction.gasUsed;
  transaction.gasPrice = event.transaction.gasPrice;
  transaction.gasLimit = event.block.gasLimit;

  store.set("Transaction", transaction.id, transaction);
}

function removeStringFromArray(
  array: string[] | null,
  element: string
): string[] {
  if (!array) {
    return [];
  }

  let index = array.indexOf(element);

  array.splice(index, 1);

  return array as string[];
}

// Helper for concatenating two byte arrays
function concat(a: ByteArray, b: ByteArray): ByteArray {
  let out = new Uint8Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = a[i];
  }
  for (let j = 0; j < b.length; j++) {
    out[a.length + j] = b[j];
  }
  return out as ByteArray;
}

// @ts-ignore
export { allocate_memory };
