import express from "express";
import NodeCache from "node-cache";
import cors from "cors";
import * as fs from "fs";
import { fetchTokenMetadata } from "./loadTokens";
import { MARGINFI_IDL } from "./idl";
import { AnchorProvider, Program } from "@project-serum/anchor";
import { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { Marginfi } from "./idl/marginfi-types";

const app = express();
// cache currently set to 200 seconds (just for testing)
const cache = new NodeCache({ stdTTL: 200 });

app.listen(9020, () => console.log("Server Start at 9020 Port"));
app.use(express.static("public"));

app.use(
  cors({
    origin: "*",
    methods: ["GET"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Content-Length",
      "Accept-Encoding",
      "X-CSRF-Token",
      "X-Auth-Token",
      "Authorization",
      "Code",
      "accept",
      "origin",
      "Cache-Control",
      "X-Requested-With",
    ],
  })
);

app.get("/health", (request, response) => {
  response.send("ok");
});

app.get("/getTokenMetadata", verifyCache, getTokenMetadata);
async function getTokenMetadata(request: any, response: any) {
  // please change this :)
  const connection = new Connection("https://app.bitspawn.workers.dev");

  const programId = "MFv2hWf31Z9kbCa1snEPYctwafyhdvnV7FZnsebVacA";
  const groupPk = new PublicKey("4qp6Fx6tnZkY5Wropq9wUYgtFxXKwE6viZxFHg3rdAG8");

  const provider = new AnchorProvider(connection, {} as any, {
    ...AnchorProvider.defaultOptions(),
    commitment:
      connection.commitment ?? AnchorProvider.defaultOptions().commitment,
  });

  const program = new Program(
    MARGINFI_IDL,
    programId,
    provider
  ) as any as Program<Marginfi>;

  const bankAccountsData = await program.account.bank.all([
    { memcmp: { offset: 8 + 32 + 1, bytes: groupPk.toBase58() } },
  ]);

  const bankMints = bankAccountsData.map((accountData) => {
    let bankData = accountData.account as any;
    return bankData.mint;
  });

  const mrgnfiTokenList = await fetchTokenMetadata(bankMints, connection);

  const mrgnfiTokenListJson = JSON.stringify(mrgnfiTokenList);
  fs.writeFile("mrgnfiTokenList.json", mrgnfiTokenListJson, "utf8", (err) => {
    if (err) throw err;
  });

  cache.set("mrgnfiTokens", bankMints);

  response.status(200).send(mrgnfiTokenList);
}

function verifyCache(request: any, response: any, next: () => any) {
  try {
    if (cache.has("mrgnfiTokens")) {
      console.log("using cache");
      const mrgnfiTokenListJson = fs.readFileSync(
        "mrgnfiTokenList.json",
        "utf-8"
      );
      const mrgnfiTokenListParsed = JSON.parse(mrgnfiTokenListJson);
      return response.status(200).send(mrgnfiTokenListParsed);
    }
    return next();
  } catch (err) {
    throw new Error(err as any);
  }
}
