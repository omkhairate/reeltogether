# ReelTogether web app setup

The app is a static, installable web app. GitHub Pages hosts the interface and Supabase stores accounts, lists, filters, members, and votes so two phones stay in sync.

## 1. Create the shared database

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Authentication → Providers → Anonymous Sign-Ins** and enable it.
3. Open **SQL Editor**, paste everything from [`apps/web/supabase/schema.sql`](apps/web/supabase/schema.sql), and press **Run**.
4. Open **Project Settings → API**. Keep the **Project URL** and **anon public key** ready.

Anonymous accounts let each friend choose a name without passwords. Each shared list uses a long, unguessable invite link.

## 2. Put the project on GitHub

1. Create a new GitHub repository and upload/push this project.
2. In the repository, open **Settings → Secrets and variables → Actions**.
3. Add a repository variable named `NEXT_PUBLIC_SUPABASE_URL` with the Supabase Project URL.
4. Add a repository secret named `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the Supabase anon public key.
5. Open **Settings → Pages** and choose **GitHub Actions** as the source.
6. Open **Actions**, choose **Deploy Web To GitHub Pages**, and run the workflow. Future pushes to `main` deploy automatically.

The live address will be `https://YOUR-GITHUB-NAME.github.io/YOUR-REPOSITORY/`.

## 3. Use it like an iPhone app

1. Open the live address in Safari.
2. Tap the Share button.
3. Choose **Add to Home Screen**.
4. Create a list, tap **Invite**, and send the link to your friend.
5. Your friend opens the link, enters their name, and adds the app to their Home Screen too.

## Local preview

Run `npm run dev` from the project folder and open `http://127.0.0.1:3000`. Without Supabase environment values, the app intentionally opens in single-device demo mode.
