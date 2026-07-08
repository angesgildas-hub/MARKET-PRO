import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Load environment variables from .env and fallback to .env.example
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.example") });

// Custom environment file loader to handle caching, quotes, and manual changes bypasses
function loadEmailCredentials() {
  const env: Record<string, string> = {};

  const parseFile = (filePath: string) => {
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIndex = trimmed.indexOf("=");
          if (eqIndex === -1) continue;
          const key = trimmed.substring(0, eqIndex).trim();
          const val = trimmed.substring(eqIndex + 1).trim();
          const cleanedVal = val.replace(/^['"]|['"]$/g, "").trim();
          if (key) {
            env[key] = cleanedVal;
          }
        }
      } catch (e) {
        console.error(`[Env Loader] Error reading ${filePath}:`, e);
      }
    }
  };

  // 1. Read .env.example as base configuration
  parseFile(path.join(process.cwd(), ".env.example"));

  // 2. Read .env (if present) to override base configuration
  parseFile(path.join(process.cwd(), ".env"));

  const getVal = (key: string, defaultValue: string = ""): string => {
    const fileVal = env[key];
    if (fileVal) {
      const lower = fileVal.toLowerCase();
      // Only use if it is not the default placeholder
      if (lower !== "your-email@gmail.com" && lower !== "your-smtp-app-password" && fileVal.trim() !== "") {
        return fileVal;
      }
    }
    const processVal = process.env[key];
    if (processVal) {
      const cleaned = processVal.trim().replace(/^['"]|['"]$/g, "").trim();
      if (cleaned !== "" && !cleaned.toLowerCase().includes("your-email") && !cleaned.toLowerCase().includes("your-smtp")) {
        return cleaned;
      }
    }
    return defaultValue;
  };

  return {
    host: getVal("SMTP_HOST", "smtp.gmail.com"),
    port: parseInt(getVal("SMTP_PORT", "587"), 10),
    secure: getVal("SMTP_SECURE", "false") === "true",
    user: getVal("SMTP_USER"),
    pass: getVal("SMTP_PASS"),
    from: getVal("SMTP_FROM") || `"Market Pro" <noreply@marketpro.com>`,
    appUrl: getVal("APP_URL", "https://marketpro.com")
  };
}

// Helper to retrieve the database ID dynamically from firebase-applet-config.json
function getFirebaseConfig() {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (err) {
    console.error("[Firestore Config Error] Failed to read firebase-applet-config.json:", err);
  }
  return null;
}

let cachedFirestoreWrapper: any = null;

async function getFirestoreInstance() {
  if (cachedFirestoreWrapper) {
    return cachedFirestoreWrapper;
  }

  // Dynamically import client Firebase SDK
  const { initializeApp: initializeClientApp } = await import("firebase/app");
  const { getAuth: getClientAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import("firebase/auth");
  const { getFirestore: getClientFirestore, collection, doc, getDoc, getDocs, query, where, addDoc, setDoc, deleteDoc, updateDoc } = await import("firebase/firestore");

  const config = getFirebaseConfig();
  if (!config) {
    throw new Error("Configuration Firebase manquante ou invalide");
  }

  // Initialize client Firebase app
  const clientApp = initializeClientApp(config);
  const clientAuth = getClientAuth(clientApp);
  const clientDb = getClientFirestore(clientApp, config.firestoreDatabaseId);

  // Authenticate as our dedicated backend system identity
  const email = "system-agent-c3e161f5@marketpro.com";
  const password = "MarketProAdmin2026!";

  try {
    await signInWithEmailAndPassword(clientAuth, email, password);
    console.log("[Firestore Auth] Serveur connecté avec succès en tant que", email);
  } catch (e: any) {
    // If login fails, try to register the identity first
    try {
      await createUserWithEmailAndPassword(clientAuth, email, password);
      console.log("[Firestore Auth] Identité de service créée et connectée :", email);
    } catch (createErr: any) {
      console.error("[Firestore Auth Error] Échec de l'authentification de l'identité de service :", createErr.message || createErr);
      throw createErr;
    }
  }

  // Implement the Admin SDK interface wrapper around the Client SDK
  class AdminFirestoreWrapper {
    constructor(private db: any) {}

    collection(colName: string) {
      return new CollectionReferenceWrapper(this.db, colName);
    }
  }

  class CollectionReferenceWrapper {
    constructor(private db: any, private colName: string, private constraints: any[] = []) {}

    doc(docId: string) {
      return new DocumentReferenceWrapper(this.db, this.colName, docId);
    }

    where(field: string, op: any, value: any) {
      return new CollectionReferenceWrapper(this.db, this.colName, [
        ...this.constraints,
        where(field, op, value)
      ]);
    }

    async get() {
      const q = query(collection(this.db, this.colName), ...this.constraints);
      const snap = await getDocs(q);
      return new QuerySnapshotWrapper(snap);
    }

    async add(data: any) {
      const docRef = await addDoc(collection(this.db, this.colName), data);
      return { id: docRef.id };
    }
  }

  class DocumentReferenceWrapper {
    constructor(private db: any, private colName: string, private docId: string) {}

    async get() {
      const d = doc(this.db, this.colName, this.docId);
      const snap = await getDoc(d);
      return {
        exists: snap.exists(),
        id: snap.id,
        data: () => snap.data()
      };
    }

    async set(data: any) {
      const d = doc(this.db, this.colName, this.docId);
      await setDoc(d, data);
    }

    async update(data: any) {
      const d = doc(this.db, this.colName, this.docId);
      await updateDoc(d, data);
    }

    async delete() {
      const d = doc(this.db, this.colName, this.docId);
      await deleteDoc(d);
    }
  }

  class QuerySnapshotWrapper {
    constructor(private snap: any) {}

    get empty() {
      return this.snap.empty;
    }

    get size() {
      return this.snap.size;
    }

    get docs() {
      return this.snap.docs.map((d: any) => ({
        id: d.id,
        data: () => d.data()
      }));
    }
  }

  cachedFirestoreWrapper = new AdminFirestoreWrapper(clientDb);
  return cachedFirestoreWrapper;
}

const currentDirname = typeof __dirname !== "undefined"
  ? __dirname
  : (() => {
      try {
        return path.dirname(fileURLToPath(import.meta.url));
      } catch (e) {
        return "";
      }
    })();

async function startServer() {
  const app = express();

  // Determine if running in production mode
  let isProduction = process.env.NODE_ENV === "production";

  // Robust check: if this code is running from the compiled server.cjs bundle, it is 100% production
  const isCjsBundle = typeof __filename !== "undefined" && (__filename.includes("dist") || __filename.endsWith(".cjs"));
  if (isCjsBundle) {
    isProduction = true;
  }

  // Always bind unconditionally to port 3000 per platform infrastructure constraints
  const PORT = 3000;

  // Body parser with payload limit (protects against extremely large requests designed to cause memory exhaustion)
  app.use(express.json({ limit: "150kb" }));

  // Custom Security Headers Middlewares
  app.use((req, res, next) => {
    // Prevent browsers from sniffing MIME types away from declared Content-Type header
    res.setHeader("X-Content-Type-Options", "nosniff");
    // Enable built-in browser reflected XSS filter protections
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Control how referrer information is transferred on requests
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // DNS Prefetch Control
    res.setHeader("X-DNS-Prefetch-Control", "off");
    next();
  });

  // Stateful, robust IP Rate Limiter to protect against brute-force, DOS, and spam scripts
  const rateLimitStore: Record<string, number[]> = {};
  
  // Clean up rate-limiting cache memory leakage every 10 minutes
  setInterval(() => {
    const now = Date.now();
    for (const ip in rateLimitStore) {
      rateLimitStore[ip] = rateLimitStore[ip].filter(timestamp => now - timestamp < 60000);
      if (rateLimitStore[ip].length === 0) {
        delete rateLimitStore[ip];
      }
    }
  }, 10 * 60 * 1000);

  function rateLimiter(limit: number, windowMs: number = 60000) {
    return (req: any, res: any, next: any) => {
      const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anonymous").split(",")[0].trim();
      const now = Date.now();
      
      if (!rateLimitStore[ip]) {
        rateLimitStore[ip] = [];
      }
      
      rateLimitStore[ip] = rateLimitStore[ip].filter(ts => now - ts < windowMs);
      
      if (rateLimitStore[ip].length >= limit) {
        console.warn(`[Security Warning] Rate limit triggered for IP: ${ip} on route: ${req.originalUrl}`);
        return res.status(429).json({ 
          success: false, 
          error: "Trop de requêtes", 
          message: "Activité suspendue par mesure de sécurité : Trop de tentatives. Veuillez patienter une minute." 
        });
      }
      
      rateLimitStore[ip].push(now);
      next();
    };
  }

  // Universal API Sanitization Middleware for preventing remote HTML, script, and code injections
  app.use("/api", (req, res, next) => {
    const sanitizeValue = (val: any): any => {
      if (typeof val === "string") {
        // Strip tags and dangerous scripting patterns
        let s = val.replace(/<[^>]*>/g, "");
        s = s.replace(/javascript\s*:/gi, "");
        s = s.replace(/onload\s*=/gi, "");
        s = s.replace(/onerror\s*=/gi, "");
        s = s.replace(/onclick\s*=/gi, "");
        return s.trim().slice(0, 1000);
      }
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const cleaned: Record<string, any> = {};
        for (const k in val) {
          if (Object.prototype.hasOwnProperty.call(val, k)) {
            cleaned[k] = sanitizeValue(val[k]);
          }
        }
        return cleaned;
      }
      return val;
    };

    if (req.body) {
      req.body = sanitizeValue(req.body);
    }
    next();
  });

  // API rate-limit bindings for security
  app.use("/api/send-email", rateLimiter(10));             // Prevent email flood triggers
  app.use("/api/admin/update-user-auth", rateLimiter(5));   // Prevent credential stuffing
  app.use("/api/admin/create-user-auth", rateLimiter(5));   // Prevent brute force on creation
  app.use("/api/saas/proxy", rateLimiter(15));               // Prevent webhook proxy flood
  app.use("/api/saas/webhook", rateLimiter(25));             // Prevent license poisoning

  // API health route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Email sending endpoint
  app.post("/api/send-email", async (req, res) => {
    const { type, data } = req.body;

    const creds = loadEmailCredentials();
    const smtpHost = creds.host;
    const smtpPort = creds.port;
    const smtpSecure = creds.secure;
    const smtpUser = creds.user;
    const smtpPass = creds.pass;
    const appUrl = creds.appUrl;

    // For maximal deliverability, align SMTP From with SMTP User.
    // If we use third party from values with Gmail SMTP, Google often rejects or blocks the mail.
    let smtpFrom = creds.from;
    if (smtpUser && smtpUser.includes("@")) {
      smtpFrom = `"Market Pro" <${smtpUser}>`;
    }

    const maskedPass = smtpPass ? `${smtpPass.slice(0, 3)}...${smtpPass.slice(-3)}` : "None";
    console.log(`[Email Service] Received request to send email of type "${type}". Using user: ${smtpUser} via host: ${smtpHost}:${smtpPort} (Pass: ${maskedPass}, From: ${smtpFrom})`);

    // Let's build the email parameters
    let to = "";
    let subject = "";
    let html = "";
    let text = "";

    if (type === "store_requested") {
      to = "ange.gildas@gmail.com, anges.gildas@gmail.com";
      subject = `[Market Pro] Nouvelle demande de création de boutique : ${data.storeName}`;
      text = `Bonjour Admin,

Un utilisateur vient de soumettre une demande de création de boutique.

Voici les détails de la demande :
- Nom de la boutique : ${data.storeName}
- Administrateur : ${data.displayName} (${data.email})
- Adresse : ${data.address || 'Non spécifiée'}
- Pays : ${data.country || 'Non spécifié'}

Rendez-vous sur l'espace Super Admin de Market Pro pour examiner et approuver cette demande.

Cordialement,
Le système Market Pro.`;

      html = `<div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #ea580c; border-bottom: 2px solid #f97316; padding-bottom: 8px;">Nouvelle Demande de Boutique</h2>
        <p>Bonjour Admin,</p>
        <p>Un utilisateur vient de s'inscrire et de soumettre une demande de création de boutique sur Market Pro.</p>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Nom de la boutique :</strong> ${data.storeName}</p>
          <p style="margin: 5px 0;"><strong>Administrateur :</strong> ${data.displayName}</p>
          <p style="margin: 5px 0;"><strong>Email :</strong> <a href="mailto:${data.email}">${data.email}</a></p>
          <p style="margin: 5px 0;"><strong>Adresse :</strong> ${data.address || 'Non spécifiée'}</p>
          <p style="margin: 5px 0;"><strong>Pays :</strong> ${data.country || 'Non spécifié'}</p>
        </div>
        <p>Veuillez vous rendre sur l'espace Super Admin de Market Pro pour attribuer ou valider la licence.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 11px; color: #6b7280;">Ceci est un message automatique, merci de ne pas y répondre.</p>
      </div>`;

    } else if (type === "store_approved") {
      to = data.email;
      subject = `[Market Pro] Votre boutique "${data.storeName}" a été approuvée ! 🎉`;
      text = `Félicitations ${data.displayName},

Votre demande pour la boutique "${data.storeName}" a été approuvée par l'administrateur principal. 
Vous pouvez à présent vous connecter et commencer à gérer votre boutique.

Lien de connexion : ${appUrl}

Nous vous remercions pour votre confiance.

Cordialement,
L'équipe Market Pro (No-Reply)`;

      html = `<div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #16a34a; border-bottom: 2px solid #22c55e; padding-bottom: 8px;">Félicitations ! 🎉</h2>
        <p>Bonjour <strong>${data.displayName}</strong>,</p>
        <p>Nous avons le plaisir de vous informer que votre demande pour la boutique <strong>"${data.storeName}"</strong> a été approuvée par l'administrateur principal !</p>
        <p>Votre compte boutique est à présent actif et prêt à l'emploi.</p>
        <div style="margin: 30px 0; text-align: center;">
          <a href="${appUrl}" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Accéder à ma Boutique</a>
        </div>
        <p>Si le bouton ci-dessus ne fonctionne pas, vous pouvez copier-coller le lien suivant dans votre navigateur : <br/>
        <a href="${appUrl}">${appUrl}</a></p>
        <p>Nous vous remercions pour votre confiance.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="font-size: 11px; color: #6b7280;">Ceci est un message automatique d'information, merci de ne pas y répondre.</p>
      </div>`;
    } else {
      return res.status(400).json({ error: "Type d'email inconnu" });
    }

    // Helper to log system notification to Firestore as a resilient backup/journal audit
    const logNotificationToFirestore = async (status: "sent" | "failed" | "mocked", errMessage?: string) => {
      try {
        const db = await getFirestoreInstance();
        await db.collection("systemNotifications").add({
          type: type || "unknown",
          to: to || "unknown",
          subject: subject || "No Subject",
          body: text || html || "",
          status: status,
          errorDetails: errMessage || null,
          timestamp: new Date()
        });
        console.log(`[Email Service] Logged notification to Firestore with status: ${status}`);
      } catch (dbErr: any) {
        console.log(`[Email Service Info] System notification logged locally on server.`);
      }
    };

    // Check if configuration exists
    if (!smtpUser || !smtpPass) {
      console.warn(`[Email Service Warning] SMTP credentials not set. Email not sent, logged to console:
To: ${to}
Subject: ${subject}
Text: ${text}`);
      await logNotificationToFirestore("mocked", "Variables d'environnement SMTP non configurées (Simulation d'envoi)");
      return res.json({ 
        success: true, 
        mocked: true, 
        message: "Email logged to console (SMTP configuration missing in server environment variables)" 
      });
    }

    try {
      let oauthOpts: any;
      const isGmail = smtpHost === "smtp.gmail.com" || 
                      (smtpUser && smtpUser.endsWith("@gmail.com")) || 
                      (smtpHost && smtpHost.toLowerCase().includes("gmail"));

      if (isGmail) {
        console.log(`[Email Service] Operating in Gmail Service Mode for user: ${smtpUser}`);
        oauthOpts = {
          service: "gmail",
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        };
      } else {
        console.log(`[Email Service] Operating in Custom SMTP Mode: ${smtpHost}:${smtpPort}`);
        oauthOpts = {
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass: smtpPass
          },
          tls: {
            rejectUnauthorized: false
          },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000
        };
      }

      const transporter = nodemailer.createTransport(oauthOpts);

      const info = await transporter.sendMail({
        from: smtpFrom,
        to,
        subject,
        text,
        html
      });

      console.log(`[Email Service] Email sent successfully: ${info.messageId}`);
      await logNotificationToFirestore("sent");
      return res.json({ success: true, messageId: info.messageId });
    } catch (err: any) {
      const isAuthError = err.code === 'EAUTH' || 
                           err.message?.includes('535') || 
                           err.message?.toLowerCase().includes('login') ||
                           err.message?.toLowerCase().includes('username and password') ||
                           err.message?.toLowerCase().includes('credentials');

      if (isAuthError) {
        console.log(`[Email Service Info] SMTP credentials check for ${to} (User: ${smtpUser}). Notice: Gmail requires an App Password instead of a normal account password.`);
        
        await logNotificationToFirestore("failed", `Authentication Failed (Gmail App Password Required): ${err.message}`);
        return res.status(200).json({ 
          success: false, 
          error: "SMTP Authentication Failed (Code 535 / EAUTH)", 
          details: err.message,
          suggestion: "Veuillez utiliser un 'Mot de passe d'application' si vous utilisez Gmail ou vérifier les informations de connexion SMTP."
        });
      }

      const isConnectionError = err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
      if (isConnectionError) {
        console.log(`[Email Service Info] Unable to connect to SMTP server : ${smtpHost}:${smtpPort} - Error Code: ${err.code}`);
        await logNotificationToFirestore("failed", `Connection Error: ${err.message} (Code: ${err.code})`);
        return res.status(200).json({
          success: false,
          error: "SMTP Connection Failed",
          details: err.message,
          suggestion: `Veuillez vérifier que l'hôte (${smtpHost}) et le port (${smtpPort}) sont ouverts et opérationnels.`
        });
      }

      console.log(`[Email Service Info] Notice about send email to ${to}:`, err.message || err);
      await logNotificationToFirestore("failed", `Unhandled error: ${err.message || String(err)}`);
      return res.status(200).json({ 
        success: false, 
        error: "Failed to send email", 
        details: err.message 
      });
    }
  });

  // Endpoint to check if there is a manually pre-registered store admin with this email and password
  app.post("/api/auth/check-manual-user", async (req, res) => {
    const { email, password } = req.body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ success: false, error: "invalid_email_format" });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({ success: false, error: "invalid_password_format" });
    }

    try {
      const db = await getFirestoreInstance();
      const querySnap = await db.collection("users")
        .where("email", "==", email.trim().toLowerCase())
        .get();

      if (querySnap.empty) {
        return res.json({ success: false, error: "not_found", message: "Aucun compte correspondant en base de données." });
      }

      // Check if any matching doc has the correct password
      let matchedDoc: any = null;
      for (const doc of querySnap.docs) {
        const data = doc.data();
        if (data.password === password) {
          matchedDoc = doc;
          break;
        }
      }

      if (!matchedDoc) {
        return res.json({ success: false, error: "invalid_password", message: "Mot de passe incorrect." });
      }

      const isManualTempId = matchedDoc.id.startsWith("user_");
      return res.json({
        success: true,
        needsAuthInit: isManualTempId,
        storeId: matchedDoc.data().storeId,
        displayName: matchedDoc.data().displayName,
        documentId: matchedDoc.id
      });
    } catch (err: any) {
      console.error("[Auth API Error] check-manual-user failed:", err);
      return res.status(500).json({ success: false, error: "internal_server_error", details: err.message });
    }
  });

  // Endpoint to move a manual user's profile to their new registration UID after client-side Firebase Auth creation
  app.post("/api/auth/link-manual-user", async (req, res) => {
    const { email, password, newUid } = req.body;

    if (!email || !password || !newUid || typeof newUid !== "string" || !newUid.match(/^[a-zA-Z0-9_\-]+$/)) {
      return res.status(400).json({ success: false, error: "invalid_parameters" });
    }

    try {
      const db = await getFirestoreInstance();
      const querySnap = await db.collection("users")
        .where("email", "==", email.trim().toLowerCase())
        .get();

      if (querySnap.empty) {
        return res.status(404).json({ success: false, error: "profile_not_found" });
      }

      let manualTempDoc: any = null;
      for (const d of querySnap.docs) {
        if (d.id.startsWith("user_") && d.data().password === password) {
          manualTempDoc = d;
          break;
        }
      }

      if (!manualTempDoc) {
        return res.status(401).json({ success: false, error: "unauthorized" });
      }

      // Copy data to the new document under doc.id == newUid
      const profileData = {
        ...manualTempDoc.data(),
        uid: newUid
      };

      await db.collection("users").doc(newUid).set(profileData);
      // Delete temporary manual user profile
      await db.collection("users").doc(manualTempDoc.id).delete();

      return res.json({ success: true, message: "Profil lié avec succès !" });
    } catch (err: any) {
      console.error("[Auth API Error] link-manual-user failed:", err);
      return res.status(500).json({ success: false, error: "internal_server_error", details: err.message || String(err) });
    }
  });

  // Admin route to create a user in Firebase Auth for manual store creations
  app.post("/api/admin/create-user-auth", async (req, res) => {
    const { email, password, displayName, callerEmail } = req.body;

    if (callerEmail !== "anges.gildas@gmail.com" && callerEmail !== "gildas@gmail.com") {
      return res.status(403).json({ success: false, error: "Accès refusé" });
    }

    if (!email || typeof email !== "string" || !email.includes("@") || email.length > 150) {
      return res.status(400).json({ success: false, error: "Format email invalide" });
    }

    if (!password || typeof password !== "string" || password.length < 6 || password.length > 100) {
      return res.status(400).json({ success: false, error: "Format de mot de passe invalide (minimum 6 caractères)" });
    }

    try {
      const config = getFirebaseConfig();
      const apiKey = config?.apiKey;
      if (!apiKey) {
        throw new Error("Clé d'API Firebase non configurée dans l'application");
      }

      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
      const restResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password,
          displayName: displayName || undefined,
          returnSecureToken: false
        })
      });

      const restData: any = await restResponse.json();

      if (!restResponse.ok) {
        // Map common Firebase Auth REST API error messages
        const errorMessage = restData.error?.message || JSON.stringify(restData);
        if (errorMessage === "EMAIL_EXISTS") {
          throw new Error("EMAIL_EXISTS: Cette adresse email est déjà utilisée.");
        }
        throw new Error(errorMessage);
      }

      const uid = restData.localId;
      return res.json({ success: true, uid: uid, message: "Utilisateur créé avec succès dans Firebase Auth !" });
    } catch (err: any) {
      console.error("[Admin API Error] Failed to create user Auth credentials via REST:", err);
      return res.status(200).json({
        success: false,
        error: "Erreur Firebase Auth",
        details: err.message || "Impossible de créer le compte d'authentification",
        suggestion: err.message?.includes("EMAIL_EXISTS") 
          ? "Cette adresse email est déjà associée à un compte." 
          : "La création de l'utilisateur Firebase Auth a échoué. Veuillez vérifier les configurations."
      });
    }
  });

  // Admin route to update secondary user credentials in Firebase Auth
  app.post("/api/admin/update-user-auth", async (req, res) => {
    const { uid, email, password, callerEmail } = req.body;

    if (callerEmail !== "anges.gildas@gmail.com" && callerEmail !== "gildas@gmail.com") {
      return res.status(403).json({ success: false, error: "Accès refusé" });
    }

    if (!uid || typeof uid !== "string" || !uid.match(/^[a-zA-Z0-9_\-]+$/) || uid.length > 128) {
      return res.status(400).json({ success: false, error: "Format uid invalide" });
    }

    if (email && (typeof email !== "string" || !email.includes("@") || email.length > 150)) {
      return res.status(400).json({ success: false, error: "Format email invalide" });
    }

    if (password && (typeof password !== "string" || password.length < 6 || password.length > 100)) {
      return res.status(400).json({ success: false, error: "Format de mot de passe invalide (6-100 caractères)" });
    }

    try {
      const config = getFirebaseConfig();
      const apiKey = config?.apiKey;
      if (!apiKey) {
        throw new Error("Clé d'API Firebase non configurée dans l'application");
      }

      const updateBody: any = {
        localId: uid,
        returnSecureToken: false
      };
      if (email) updateBody.email = email.trim().toLowerCase();
      if (password) updateBody.password = password;

      const url = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`;
      const restResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody)
      });

      const restData: any = await restResponse.json();

      if (!restResponse.ok) {
        const errorMessage = restData.error?.message || JSON.stringify(restData);
        throw new Error(errorMessage);
      }

      return res.json({ success: true, message: "Informations de connexion mises à jour dans Firebase Auth avec succès !" });
    } catch (err: any) {
      console.error("[Admin API Error] Failed to update user Auth credentials:", err);
      return res.status(200).json({
        success: false,
        error: "Erreur Firebase Auth",
        details: err.message || "Impossible de mettre à jour le compte d'authentification",
        suggestion: "Les modifications ont été configurées, mais la mise à jour automatique avec Firebase Auth a rencontré une limitation de droits ou de configuration."
      });
    }
  });

  // Proxy to forward webhook requests securely without browser CORS limitations
  app.post("/api/saas/proxy", async (req, res) => {
    const { url, token, payload } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: "L'URL du SaaS est requise" });
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": token ? `Bearer ${token}` : ""
        },
        body: JSON.stringify(payload)
      });

      let responseText = "";
      try {
        responseText = await response.text();
      } catch (e) {}

      console.log(`[SaaS Proxy] Response status: ${response.status} from ${url}`);
      return res.json({
        success: response.ok,
        status: response.status,
        response: responseText
      });
    } catch (err: any) {
      console.error("[SaaS Proxy Error] Failed to contact SaaS:", err);
      return res.status(500).json({
        success: false,
        error: "Impossible de contacter l'API du SaaS (serveur injoignable ou certificat invalide)",
        details: err.message
      });
    }
  });

  // Webhook receiver for SaaS to update client stores license from remote SaaS billing/subscriptions
  app.post("/api/saas/webhook", async (req, res) => {
    const { storeId, licenseStatus, licenseExpiry, token } = req.body;
    
    if (!storeId || !licenseStatus) {
      return res.status(400).json({ success: false, error: "storeId et licenseStatus sont requis" });
    }

    if (typeof storeId !== "string" || !storeId.match(/^[a-zA-Z0-9_\-]+$/) || storeId.length > 128) {
      return res.status(400).json({ success: false, error: "Format storeId invalide" });
    }

    if (typeof licenseStatus !== "string" || !["active", "pending", "inactive", "suspended", "approved"].includes(licenseStatus)) {
      return res.status(400).json({ success: false, error: "Statut de licence invalide" });
    }

    if (licenseExpiry && (typeof licenseExpiry !== "string" || licenseExpiry.length > 50)) {
      return res.status(400).json({ success: false, error: "Format de date d'expiration invalide" });
    }

    try {
      const db = await getFirestoreInstance();
      
      // Fetch SaaS Token from database to authenticate request
      const globalsSnap = await db.collection("systemConfig").doc("globals").get();
      const globalsData = globalsSnap.data();
      const configToken = globalsData?.saasApiToken;

      const incomingToken = token || req.headers.authorization?.replace("Bearer ", "");

      if (!configToken || incomingToken !== configToken) {
        return res.status(401).json({ success: false, error: "Jeton de sécurité invalide ou non configuré dans l'administration" });
      }

      // Update store settings in Firestore
      const storeRef = db.collection("storeSettings").doc(storeId);
      const storeSnap = await storeRef.get();

      if (!storeSnap.exists) {
        return res.status(404).json({ success: false, error: `Boutique introuvable avec l'ID : ${storeId}` });
      }

      const updatePayload: any = {
        licenseStatus,
        updatedAt: new Date().toISOString()
      };

      if (licenseExpiry) {
        updatePayload.licenseExpiry = licenseExpiry;
      }

      await storeRef.update(updatePayload);

      return res.json({ 
        success: true, 
        message: `Licence de la boutique '${storeSnap.data()?.name || storeId}' mise à jour avec succès via le Webhook SaaS.`,
        updatedStore: { id: storeId, licenseStatus, licenseExpiry }
      });
    } catch (err: any) {
      console.error("[SaaS Webhook API Error]:", err);
      return res.status(500).json({ success: false, error: "Erreur interne du webhook", details: err.message });
    }
  });

  // Vite middleware for development or fallback
  let viteLoaded = false;
  let viteInstance: any = null;
  if (!isProduction) {
    try {
      console.log("[Server] Attempting to load Vite development server...");
      const { createServer: createViteServer } = await import("vite");
      viteInstance = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(viteInstance.middlewares);
      viteLoaded = true;
      console.log("[Server] Vite development middleware successfully mounted.");
    } catch (viteErr) {
      console.warn("[Server Warning] Failed to load Vite development server (probably running in a production container where devDependencies are not installed). Falling back to serving static files.", viteErr);
    }
  }

  // Serve static files if in production or if Vite failed to load as fallback
  if (isProduction || !viteLoaded) {
    const distPath = path.join(process.cwd(), "dist");
    console.log("[Production/Fallback] Serving static files from:", distPath);
    app.use(express.static(distPath));
  }

  // Catch-all fallback handler for all routes to support Client-Side Routing (SPA)
  // This directs any deep links (e.g. /login, /inventory, /pos) back to index.html
  app.get("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip API routes so they correctly return 404 or process normally
    if (url.startsWith("/api/")) {
      return next();
    }

    // Skip files with a file extension to avoid serving index.html for missing images/assets
    const pathname = url.split("?")[0];
    const ext = path.extname(pathname);
    if (ext && ext.length > 1) {
      return next();
    }

    if (!isProduction && viteLoaded && viteInstance) {
      try {
        const fs = await import("fs");
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        // Apply Vite's HTML transforms (injects HMR client, CSS, script elements, etc.)
        template = await viteInstance.transformIndexHtml(url, template);
        return res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (err) {
        console.error("[Dev Fallback Error] Failed to send transformed index.html:", err);
        return next(err);
      }
    } else {
      const distPath = path.join(process.cwd(), "dist");
      const indexPath = path.join(distPath, "index.html");
      return res.sendFile(indexPath, (err) => {
        if (err) {
          console.error("[Production Fallback Error] Failed to send index.html:", err);
          return res.status(500).send("Error loading application: static assets are stale or missing. Please contact administrator.");
        }
      });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
