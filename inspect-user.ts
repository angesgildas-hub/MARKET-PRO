import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
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
    const userRef = doc(db, "users", "h628hIHkLIgGiJNjadxh07f74ui1");
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      console.log("User h628hIHkLIgGiJNjadxh07f74ui1 (coco@gmail.com) data:", JSON.stringify(userSnap.data(), null, 2));
    } else {
      console.log("User h628hIHkLIgGiJNjadxh07f74ui1 not found.");
    }
  } catch (err: any) {
    console.error("Query failed:", err.message || err);
  }
}

run();
