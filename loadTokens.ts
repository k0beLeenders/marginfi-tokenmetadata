import { Connection, PublicKey } from "@solana/web3.js";
import { array, assert, Infer, number, object, string } from "superstruct";
import { Metadata, PROGRAM_ID } from "@metaplex-foundation/mpl-token-metadata";
import * as fs from "fs";

// ================ token metadata ================

const TokenMetadataRaw = object({
  address: string(),
  chainId: number(),
  decimals: number(),
  name: string(),
  symbol: string(),
  logoURI: string(),
  extensions: object(),
});
const TokenMetadataList = array(TokenMetadataRaw);

export type TokenMetadataRaw = Infer<typeof TokenMetadataRaw>;

export async function fetchTokenMetadata(
  mints: PublicKey[],
  connection: Connection
) {
  const oldTokenListJson = fs.readFileSync("oldTokenList.json", "utf-8");
  const oldTokenList = JSON.parse(oldTokenListJson);

  const mintPdas = mints.map(
    (mint) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), PROGRAM_ID.toBuffer(), mint.toBuffer()],
        PROGRAM_ID
      )[0]
  );

  const tokensMetadataJson = Object.fromEntries(
    (
      await Promise.all(
        mintPdas
          .map((mintPda, idx) =>
            Metadata.fromAccountAddress(connection, mintPda).then(
              (tokenMetadata) =>
                fetch(tokenMetadata.data.uri).then((tokenMetadataRaw) =>
                  tokenMetadataRaw.json()
                )
            )
          )
          .map((p) => p.catch((e) => undefined))
      )
    ).map((tokenMetaData, idx) => [mints[idx].toString(), tokenMetaData])
  );

  const tokenDecimals = Object.fromEntries(
    (
      await Promise.all(
        mints.map((mint) =>
          connection.getTokenSupply(mint).then((v) => v.value.decimals)
        )
      )
    ).map((tokenSupply, idx) => [mints[idx].toString(), tokenSupply])
  );

  const tokensMetadataParsed = Object.keys(tokensMetadataJson).flatMap(
    (mint) => {
      const tokenMetadata = tokensMetadataJson[mint];

      if (!tokenMetadata) {
        const oldTokenMetadata = oldTokenList[mint];
        if (!oldTokenMetadata) {
          console.error(`details for mint ${mint} not found`);
          return [];
        }

        return {
          symbol: oldTokenMetadata.symbol,
          address: oldTokenMetadata.address,
          chainId: oldTokenMetadata.chainId,
          decimals: oldTokenMetadata.decimals,
          name: oldTokenMetadata.name,
          logoURI: oldTokenMetadata.logoURI,
          extensions: oldTokenMetadata.extensions,
        } as TokenMetadataRaw;
      } else {
        return {
          symbol: tokenMetadata.symbol,
          address: mint,
          chainId: 101,
          decimals: tokenDecimals[mint],
          name: tokenMetadata.name,
          logoURI: tokenMetadata.image,
          extensions: { coingeckoId: "" },
        } as TokenMetadataRaw;
      }
    }
  );

  assert(tokensMetadataParsed, TokenMetadataList);

  return tokensMetadataParsed;
}
