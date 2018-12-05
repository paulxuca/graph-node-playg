import "allocator/arena";

import { Transfer as TransferEvent, ERC721 } from "../types/ERC721/ERC721";
import {
  User,
  Transaction,
  TokenContract,
  Token,
  TokenContractUser,
  TokenTransaction
} from "../types/schema";
import { store, ByteArray, Bytes } from "@graphprotocol/graph-ts";

function createTransactionForTransferEvent(event: TransferEvent): Transaction {
  let transaction = new Transaction();

  let fromAddress = event.params.from;
  let toAddress = event.params.to;

  transaction.id = event.transaction.hash.toHex();
  transaction.sender = toAddress.toHex();
  transaction.senderAddress = fromAddress;

  transaction.receiver = toAddress.toHex();
  transaction.receiverAddress = toAddress;

  transaction.gasUsed = event.transaction.gasUsed;
  transaction.gasPrice = event.transaction.gasPrice;
  transaction.gasLimit = event.block.gasLimit;

  store.set("Transaction", transaction.id, transaction);

  return transaction;
}

function createTokenContractForTransferEvent(
  event: TransferEvent
): TokenContract {
  let tokenContract = ERC721.bind(event.address);

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

  return tokenContractEntity;
}

function createTokenForTransferEvent(
  event: TransferEvent,
  tokenContract: TokenContract,
  transaction: Transaction
): Token {
  let toAddress = event.params.to;
  let tokenId = event.params.tokenId;

  let tokenEntity = store.get("Token", tokenId.toString()) as Token;

  let tokenEntityId = concat(
    tokenId as ByteArray,
    tokenContract.address as ByteArray
  ).toHex();

  // Create a token transaction entity
  let tokenTransaction = new TokenTransaction();

  tokenTransaction.id = concat(
    tokenId as ByteArray,
    event.transaction.hash as ByteArray
  ).toHex();

  tokenTransaction.token = tokenEntityId;
  tokenTransaction.tokenId = tokenId;

  tokenTransaction.transaction = transaction.id;
  tokenTransaction.transactionId = transaction.id;

  // Creates Token if not exists.
  if (!tokenEntity) {
    tokenEntity = new Token();

    tokenEntity.id = tokenEntityId;
    tokenEntity.tokenId = tokenId;
    tokenEntity.tokenContractAddress = tokenContract.address;
    tokenEntity.tokenContract = tokenContract.id;
    tokenEntity.tokenTransactions = [];
  }

  tokenEntity.tokenTransactions = pushStringToArray(
    tokenEntity.tokenTransactions as Array<string>,
    tokenTransaction.id
  );

  tokenEntity.owner = toAddress.toHex();
  tokenEntity.ownerAddress = toAddress;

  store.set("TokenTransaction", tokenTransaction.id, tokenTransaction);
  store.set("Token", tokenEntityId, tokenEntity);

  return tokenEntity;
}

export function transferHandler(event: TransferEvent): void {
  // Init event params
  let fromAddress = event.params.from;
  let toAddress = event.params.to;

  let fromUser = (store.get("User", fromAddress.toHex()) as User) || new User();
  let toUser = (store.get("User", toAddress.toHex()) as User) || new User();

  fromUser.address = fromAddress;
  fromUser.id = fromAddress.toHex();

  toUser.address = toAddress;
  toUser.id = toAddress.toHex();

  store.set("User", fromUser.address.toHex(), fromUser);
  store.set("User", toUser.address.toHex(), toUser);

  let transactionEntity = createTransactionForTransferEvent(event);
  let tokenContractEntity = createTokenContractForTransferEvent(event);
  let tokenEntity = createTokenForTransferEvent(
    event,
    tokenContractEntity,
    transactionEntity
  );

  // Manage TokenContractUser here.
  // The TokenContractUser is a concat of token contract address + user address
  let toUserTokenContractUserId = concat(
    tokenContractEntity.address as ByteArray,
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
    // FIX
    // toUserTokenContractUser.tokenContract = tokenContractEntity.id;
    toUserTokenContractUser.tokenContract = tokenContractEntity.address.toHex();

    // FIX
    // toUserTokenContractUser.user = toUser.id;
    toUserTokenContractUser.user = toUser.address.toHex();

    toUserTokenContractUser.userAddress = toUser.address;
  } else {
    toUserTokenContractUser.tokens = pushStringToArray(
      toUserTokenContractUser.tokens as Array<string>,
      tokenEntity.id
    );
  }

  store.set(
    "TokenContractUser",
    toUserTokenContractUserId,
    toUserTokenContractUser
  );

  let fromUserTokenContractUserId = concat(
    tokenContractEntity.address as ByteArray,
    fromUser.address as Bytes
  ).toHex();

  let fromUserTokenContractUser = store.get(
    "TokenContractUser",
    fromUserTokenContractUserId
  ) as TokenContractUser;

  // Assume all events are synced on chain in order.
  // Only care about removing this record if it's safe to remove.
  if (fromUserTokenContractUser) {
    fromUserTokenContractUser.tokens = fromUserTokenContractUser.tokens as Array<
      string
    >;

    fromUserTokenContractUser.tokens = removeStringFromArray(
      fromUserTokenContractUser.tokens as Array<string>,
      tokenEntity.id
    );

    if (fromUserTokenContractUser.tokens.length === 0) {
      store.remove("TokenContractUser", fromUserTokenContractUserId);
    } else {
      store.set(
        "TokenContractUser",
        fromUserTokenContractUserId,
        fromUserTokenContractUser
      );
    }
  }
}

// Helpers
function removeStringFromArray(array: string[], element: string): string[] {
  let outArray = new Array<string>();

  for (let i = 0; i < array.length; i++) {
    if (element !== array[i]) {
      outArray[i] = array[i];
    }
  }

  return outArray;
}

function pushStringToArray(array: string[], element: string): string[] {
  let outArray = new Array<string>(array.length + 1);

  for (let i = 0; i < array.length; i++) {
    outArray[i] = array[i];
  }

  outArray[array.length] = element;

  return outArray;
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
