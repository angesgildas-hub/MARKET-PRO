import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

async function run() {
  const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const email = "system-agent-c3e161f5@marketpro.com";
  const password = "MarketProAdmin2026!";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Logged in successfully.");
  } catch (e: any) {
    console.error("Login failed:", e.message);
    return;
  }

  try {
    console.log("Querying inventories...");
    const snap = await getDocs(collection(db, "inventories"));
    console.log("Total inventories:", snap.size);
    snap.forEach(doc => {
      console.log(`Inventory ID: ${doc.id}, data:`, JSON.stringify(doc.data()));
    });
  } catch (err: any) {
    console.error("Query failed:", err.message || err);
  }
}

run();
