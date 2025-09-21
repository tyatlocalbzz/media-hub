# Media Hub 🎬

A modern web application for transcribing and managing media files using Google Drive storage and AI-powered transcription.

## 🚀 Current Status: Phase 1 Complete

### ✅ What's Working
- **Google OAuth Authentication** - Secure sign-in with Google accounts
- **Automatic Drive Setup** - Creates Media Hub folder structure on first login
- **User Dashboard** - Clean, minimalist interface with dark mode support
- **Mindful Moments** - 20% chance of inspirational quotes with optional meditation timer
- **Data Ownership** - Files stored in user's Google Drive, not our servers
- **Session Management** - Protected routes with middleware

### 🎯 Next: Phase 2 - Media Processing
See [PHASE2.md](./PHASE2.md) for the implementation roadmap.

## 🛠 Tech Stack

- **Framework**: Next.js 14 with App Router
- **Authentication**: Supabase Auth with Google OAuth
- **Database**: PostgreSQL (via Supabase) with Prisma ORM
- **Storage**: Google Drive API
- **Styling**: Tailwind CSS
- **Transcription**: OpenAI Whisper (Phase 2)
- **Deployment**: Vercel

## 📦 Installation

### Prerequisites
- Node.js 18+ (20+ recommended)
- npm or yarn
- Supabase account
- Google Cloud Console project

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone [repository-url]
   cd media-hub
   npm install
   ```

2. **Set up Supabase**
   - Create a new Supabase project
   - Enable Google OAuth in Authentication → Providers
   - Set callback URL: `http://localhost:3000/api/auth/callback`
   - Run SQL to create users table (see below)

3. **Configure Google OAuth**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: Your Supabase callback URL
   - Enable Google Drive API

4. **Environment Variables**
   Copy `.env.local.example` to `.env.local` and fill in:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   DATABASE_URL=your_database_url
   DIRECT_URL=your_direct_database_url
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

5. **Database Setup**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

   Or run this SQL in Supabase:
   ```sql
   CREATE TABLE IF NOT EXISTS users (
     id UUID PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     drive_folder_id TEXT,
     incoming_folder_id TEXT,
     refresh_token TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   ALTER TABLE users ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users can read own data" ON users
     FOR SELECT USING (auth.uid() = id);

   CREATE POLICY "Users can update own data" ON users
     FOR UPDATE USING (auth.uid() = id);

   CREATE POLICY "Enable insert for authenticated users only" ON users
     FOR INSERT WITH CHECK (auth.uid() = id);
   ```

6. **Run the application**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

## 🎮 Usage

1. **Sign In**: Click "Sign in with Google" on the login page
2. **First Login**:
   - Automatically creates `/Media Hub/Incoming` folder in your Drive
   - Shows 2.5-second onboarding animation
3. **Dashboard**:
   - Access your Drive folder
   - View statistics (Phase 2)
   - Manage files (Phase 2)
4. **Mindful Moments**:
   - 20% chance on return visits
   - Toggle always-on in footer

## 🔒 Security & Privacy

- **Your Data, Your Control**: All files remain in YOUR Google Drive
- **No Lock-in**: Export or access files directly in Drive anytime
- **Minimal Permissions**: Only accesses the Media Hub folder
- **Open Source**: Audit the code yourself

## 🗺 Roadmap

### Phase 1 ✅ (Complete)
- Authentication system
- Drive integration
- User dashboard
- Basic UI/UX

### Phase 2 🚧 (Next)
- File monitoring & sync
- AI transcription
- Transcript editing
- Export formats

### Phase 3 📋 (Planned)
- Real-time collaboration
- Speaker diarization
- Multi-language support
- Mobile apps

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

[Your License Here]

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: [PHASE2.md](./PHASE2.md) for technical details
- **Contact**: [Your contact info]

## 🙏 Acknowledgments

- Supabase for authentication and database
- Google for Drive API
- OpenAI for Whisper transcription
- All our contributors

---

**Note**: This is a work in progress. Phase 2 implementation coming soon!# media-hub
