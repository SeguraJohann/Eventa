# Getting started

Step-by-step guide to run **Eventa** on your own Firebase project, host it for free and install it on your phone. Everything fits in the free **Spark** plan, and no credit card is needed.

Eventa is a single-user app: your Google account is the only one that can read or write the data.

## Requirements

- [Node.js](https://nodejs.org) 20 or newer
- A Google account
- A terminal open in the project folder

## 1. Clone and install

```bash
git clone https://github.com/SeguraJohann/Eventa.git
cd Eventa
npm install
```

## 2. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Create a project**.
2. Pick a name (for example `eventa`). Google Analytics is not used, so you can turn it off.
3. Keep the free **Spark** plan, which is the default.

## 3. Enable Google sign-in

1. Open **Build → Authentication** and click **Get started**.
2. In **Sign-in method**, choose **Google**, turn on **Enable**, pick your email as the support email and click **Save**.

## 4. Create the database

1. Open **Build → Firestore Database** and click **Create database**.
2. Keep the `(default)` database ID and choose a location near you. **It cannot be changed later.**
3. Choose **Start in production mode**. This blocks all access until you publish the rules in step 8, and that is what you want.

## 5. Register the web app

1. On the project home page, click the web icon **`</>`**.
2. Give it a nickname (for example `eventa-web`). Leave **Firebase Hosting** unchecked for now and click **Register app**.
3. Keep the `firebaseConfig` block open or copy it. You need its values in the next step.

## 6. Fill in your `.env`

1. Copy the template:
   ```bash
   cp .env.example .env
   ```
   On Windows PowerShell: `Copy-Item .env.example .env`.
2. Open `.env` and fill each `VITE_FIREBASE_*` variable with the matching value from `firebaseConfig`:

   | Variable | `firebaseConfig` key |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |

   Use plain lines like `VITE_FIREBASE_PROJECT_ID=my-project`: no spaces around `=` and no JavaScript syntax. **Save the file.** `.env` is ignored by git and is never uploaded.

## 7. Run locally and sign in once

```bash
npm run dev
```

Open the address it prints (usually <http://localhost:5173>) and sign in with Google. If you see "Falta la configuración de Firebase", check that `.env` is saved, then stop the server with `Ctrl+C` and start it again. Vite only reads `.env` at startup.

Data will not load yet, and permission errors are expected, because Firestore is still locked.

## 8. Lock the database to your account

1. In the Firebase console open **Authentication → Users** and copy your **User UID**.
2. Create your local rules file from the template:
   ```bash
   cp firestore.rules.example firestore.rules
   ```
3. Open `firestore.rules` and replace `REPLACE_WITH_YOUR_UID` with your UID. This file is ignored by git.
4. Log in to the Firebase CLI and link the project:
   ```bash
   npx firebase login
   npx firebase use --add
   ```
   Choose your project and use `default` as the alias.
5. Publish the rules:
   ```bash
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```
6. Restart `npm run dev`, reload the page and sign in. Create an event to check that it works. It should appear in the Firestore console under `users/<your UID>/items`.

## 9. Publish the app (Hosting)

```bash
npm run build
npx firebase deploy --only hosting
```

If the deploy fails because Hosting is not set up, open **Build → Hosting → Get started** in the console, close the wizard and run the deploy again.

The command prints your **Hosting URL**, for example `https://your-project.web.app`. Open it and sign in. If sign-in fails with a domain error, add the domain under **Authentication → Settings → Authorized domains**. The default `*.web.app` and `*.firebaseapp.com` domains are normally already there.

To update the app later, run the same two commands again.

## 10. Install it on your phone

1. Open your Hosting URL in **Chrome** on Android (or **Safari** on iPhone) and sign in.
2. Android: menu **⋮ → Add to Home screen**. iPhone: **Share → Add to Home Screen**.

On Android, Chrome may also offer **Install app** directly. It opens full screen, with its own icon and without the browser bar. If you added a shortcut before the manifest existed, remove it and add it again.

To use your own icon, replace the PNG files in `public/icons/` (192, 512 and 180 px for iPhone) and deploy again.

Your data also works offline: changes are stored on the device and synced when the connection returns.

## Troubleshooting

| Problem | What to check |
|---|---|
| "Falta la configuración de Firebase" | `.env` is saved, has the variables filled in and the dev server was restarted. |
| Permission errors after signing in | The rules were deployed (step 8) and the UID in `firestore.rules` is the one shown under Authentication → Users. |
| Google pop-up does not open | Allow pop-ups for the site. |
| Login fails only on the hosted URL | Add the domain to Authentication → Settings → Authorized domains. |
| `firebase` command not found | Use `npx firebase …`, or install it with `npm install -g firebase-tools`. |
