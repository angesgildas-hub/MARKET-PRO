import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

async function test() {
  const config = JSON.parse(fs.readFileSync("./firebase-applet-config.json", "utf-8"));
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app, config.firestoreDatabaseId);

  const email = "system-agent-c3e161f5@marketpro.com";
  const password = "MarketProAdmin2026!";

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (e: any) {
    console.error("Login failed:", e.message);
    return;
  }

  try {
    console.log("Listing all users...");
    const snap = await getDocs(collection(db, "users"));
    console.log("Total users in DB:", snap.size);
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id} | Email: ${data.email} | Active: ${data.isActive} | Role: ${data.role}`);
    });
  } catch (err: any) {
    console.error("Query failed:", err.message || err);
  }
}

test();
