import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Palette, 
  Sparkles, 
  Diamond, 
  Coffee, 
  Bolt, 
  Leaf, 
  PartyPopper, 
  FlaskConical,
  CheckCircle2,
  Clock,
  Layout,
  LogOut,
  User as UserIcon,
  Loader2,
  Image as ImageIcon,
  History
} from 'lucide-react';
import { auth, signInWithGoogle, logout, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { generateAdImage } from './lib/gemini';

// --- Types ---

interface Asset {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
}

interface Generation {
  id: string;
  prompt: string;
  mood: string;
  imageUrl: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: any;
}

// --- Data ---

const MOODS = [
  { id: 'luxury', label: 'Luxury', icon: Diamond },
  { id: 'cozy', label: 'Cozy', icon: Coffee },
  { id: 'dynamic', label: 'Dynamic', icon: Bolt },
  { id: 'minimal', label: 'Minimal', icon: Leaf },
  { id: 'playful', label: 'Playful', icon: PartyPopper },
  { id: 'tech', label: 'Tech', icon: FlaskConical },
];

// --- Components ---

const Navbar = ({ user }: { user: User | null }) => (
  <header className="fixed top-0 w-full z-50 bg-[#FAF9F6]/80 backdrop-blur-md border-b border-orange-100/20 shadow-warm py-4 px-8">
    <div className="max-w-7xl mx-auto flex justify-between items-center">
      <div className="text-xl font-bold tracking-tighter text-slate-900">AdGen AI</div>
      <nav className="hidden md:flex gap-8">
        {['Features', 'Pricing', 'Showcase', 'About'].map((item) => (
          <a key={item} href="#" className="text-sm font-medium text-slate-600 hover:text-brand-apricot transition-colors">
            {item}
          </a>
        ))}
      </nav>
      <div className="flex items-center gap-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-full">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-6 h-6 rounded-full" />
              ) : (
                <UserIcon className="w-4 h-4 text-slate-400" />
              )}
              <span className="text-sm font-semibold text-slate-700">{user.displayName}</span>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button 
            onClick={signInWithGoogle}
            className="flex items-center gap-2 px-6 py-2 bg-white border border-slate-200 rounded-full font-semibold text-sm hover:border-brand-apricot hover:text-brand-apricot transition-all active:scale-95 cursor-pointer shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-4 h-4" alt="Google" />
            Login
          </button>
        )}
        <button className="bg-brand-apricot text-white px-6 py-2 rounded-full font-semibold text-sm hover:bg-orange-600 transition-colors active:scale-95 cursor-pointer">
          Get Started
        </button>
      </div>
    </div>
  </header>
);

const SourceAssets = ({ user, assets }: { user: User | null, assets: Asset[] }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // In a real app, we'd upload to Firebase Storage. 
    // Here we'll use a placeholder URL or a local Blob URL for demo.
    const reader = new FileReader();
    reader.onload = async () => {
      const url = reader.result as string;
      const path = `users/${user.uid}/assets`;
      try {
        await addDoc(collection(db, path), {
          userId: user.uid,
          url: url, // Note: In production, store the Storage URL
          fileName: file.name,
          mimeType: file.type,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="card-warm group">
      <h3 className="text-2xl mb-6 flex items-center gap-2 text-slate-800">
        <Upload className="w-6 h-6 text-brand-apricot" />
        Source Assets
      </h3>
      <div 
        onClick={handleUploadClick}
        className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center hover:border-brand-apricot transition-all cursor-pointer bg-slate-50/30 group-hover:bg-brand-apricot/5"
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
          accept="image/*"
        />
        <div className="w-16 h-16 bg-brand-apricot/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-500">
          <Upload className="w-8 h-8 text-brand-apricot" />
        </div>
        <p className="font-semibold text-slate-700 mb-2">Drag and drop your product images, logos, and brand guidelines.</p>
        <p className="text-sm text-slate-500 mb-6 font-body">Supports JPG, PNG up to 50MB</p>
        <button className="bg-brand-apricot text-white px-8 py-3 rounded-full font-semibold text-sm hover:bg-orange-600 transition-colors shadow-lg shadow-orange-100">
          Browse Files
        </button>
      </div>

      {assets.length > 0 && (
        <div className="mt-8 pt-8 border-t border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Brand Library</h4>
            <span className="text-[10px] font-bold text-brand-apricot">{assets.length} Assets</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {assets.map((asset) => (
              <motion.div 
                key={asset.id} 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 group/asset shadow-sm hover:shadow-lg transition-all"
              >
                <img src={asset.url} alt={asset.fileName} className="w-full h-full object-cover transition-transform duration-500 group-hover/asset:scale-110" />
                <div className="absolute inset-0 bg-brand-apricot/20 opacity-0 group-hover/asset:opacity-100 transition-opacity flex items-center justify-center">
                   <CheckCircle2 className="w-5 h-5 text-white drop-shadow-md" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AestheticMood = ({ 
  activeMood, 
  onMoodSelect, 
  customPrompt, 
  onPromptChange 
}: { 
  activeMood: string, 
  onMoodSelect: (id: string) => void,
  customPrompt: string,
  onPromptChange: (val: string) => void
}) => (
  <div className="card-warm">
    <h3 className="text-2xl mb-4 flex items-center gap-2 text-slate-800">
      <Palette className="w-6 h-6 text-brand-apricot" />
      Aesthetic & Mood
    </h3>
    <p className="text-slate-500 mb-8 font-body">Select a baseline mood to guide the AI's creative direction, or provide a detailed prompt below.</p>
    
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 mb-10">
      {MOODS.map((mood) => {
        const Icon = mood.icon;
        const isActive = activeMood === mood.id;
        return (
          <motion.div 
            key={mood.id}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onMoodSelect(mood.id)}
            className={`mood-card ${isActive ? 'active' : ''}`}
          >
            <Icon className={`w-8 h-8 mb-2 transition-colors ${isActive ? 'text-brand-apricot' : 'text-slate-400'}`} />
            <span className={`text-xs font-semibold ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>{mood.label}</span>
          </motion.div>
        );
      })}
    </div>

    <div>
      <label className="block text-sm font-bold text-slate-700 mb-2 uppercase tracking-wider">Custom Ad Prompt</label>
      <textarea 
        value={customPrompt}
        onChange={(e) => onPromptChange(e.target.value)}
        className="w-full bg-white border border-slate-200 rounded-xl p-4 text-slate-900 focus:border-brand-apricot focus:ring-1 focus:ring-brand-apricot transition-all outline-none min-h-[160px] font-body"
        placeholder="Describe the ideal setting, lighting, and composition for your ad..."
      />
    </div>
  </div>
);

const ModelStatus = ({ mood, assetCount, onGenerate, isGenerating, user }: { 
  mood: string, 
  assetCount: number, 
  onGenerate: () => void,
  isGenerating: boolean,
  user: User | null
}) => (
  <div className="card-warm border border-transparent hover:border-brand-apricot/20">
    <div className="flex items-center justify-between mb-8">
      <h3 className="text-2xl text-slate-800">Model Status</h3>
      <div className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-extrabold text-slate-500 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-orange-500 animate-pulse' : 'bg-slate-400'} ring-4 ring-slate-100`} />
        {isGenerating ? 'GENERATING' : 'READY'}
      </div>
    </div>

    <div className="space-y-6 mb-10">
      {[
        { label: 'Assets Loaded', value: `${assetCount} / 15`, icon: Upload },
        { label: 'Primary Mood', value: mood.charAt(0).toUpperCase() + mood.slice(1), icon: Palette, highlight: true },
        { label: 'Est. Generation', value: '~10 Seconds', icon: Clock },
      ].map((item) => (
        <div key={item.label} className="flex justify-between items-center py-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-500">
            <item.icon className="w-4 h-4" />
            <span className="text-sm font-medium">{item.label}</span>
          </div>
          <span className={`text-sm font-bold ${item.highlight ? 'text-brand-apricot' : 'text-slate-900'}`}>{item.value}</span>
        </div>
      ))}
    </div>

    {user ? (
      <button 
        onClick={onGenerate}
        disabled={isGenerating || assetCount === 0}
        className={`w-full bg-brand-apricot text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-orange-600 transition-all shadow-lg shadow-orange-100 active:scale-[0.98] ${
          (isGenerating || assetCount === 0) ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer hover:-translate-y-1'
        }`}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Ad
          </>
        )}
      </button>
    ) : (
      <button 
        onClick={signInWithGoogle}
        className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg active:scale-[0.98]"
      >
        <UserIcon className="w-5 h-5" />
        Login to Generate
      </button>
    )}
    
    {user && assetCount === 0 && !isGenerating && (
      <p className="text-center text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest italic animate-bounce">
        Please upload assets to begin.
      </p>
    )}
  </div>
);

const HistoryGrid = ({ generations }: { generations: Generation[] }) => (
  <div className="mt-16 space-y-8">
    <div className="flex items-center gap-3">
      <History className="w-6 h-6 text-brand-apricot" />
      <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Recent Generations</h2>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {generations.map((gen) => (
        <motion.div 
          key={gen.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="group rounded-[2rem] overflow-hidden bg-white border border-slate-100 shadow-sm hover:shadow-xl transition-all duration-500"
        >
          <div className="aspect-square relative overflow-hidden">
            {gen.status === 'pending' ? (
              <div className="absolute inset-0 bg-slate-50 flex flex-col items-center justify-center text-slate-400 gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-brand-apricot" />
                <span className="text-sm font-bold uppercase tracking-widest">Processing...</span>
              </div>
            ) : (
              <img src={gen.imageUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Generated Ad" />
            )}
            <div className="absolute top-4 right-4">
              <span className={`px-3 py-1 rounded-full text-[10px] font-extrabold shadow-sm ${
                gen.status === 'completed' ? 'bg-green-500 text-white' : 
                gen.status === 'failed' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'
              }`}>
                {gen.status.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="p-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold text-brand-apricot uppercase tracking-widest">{gen.mood}</span>
              <span className="text-[10px] text-slate-400 font-medium">
                {gen.createdAt?.toDate().toLocaleDateString()}
              </span>
            </div>
            <p className="text-sm text-slate-600 line-clamp-2 font-body italic leading-relaxed">
              "{gen.prompt}"
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  </div>
);

const PreviewImage = ({ mood }: { mood: string }) => (
  <div className="rounded-[1.5rem] overflow-hidden shadow-warm h-[380px] relative group border-4 border-white">
    <div 
      className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
      style={{ backgroundImage: `url('https://images.unsplash.com/photo-1540518614846-7eded433c457?auto=format&fit=crop&q=80&w=2670')` }}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/20 to-transparent flex flex-col justify-end p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        key={mood}
      >
        <span className="bg-brand-apricot text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-3 inline-block">
          {mood} Aesthetic Example
        </span>
        <p className="text-lg text-white font-medium leading-tight">
          "A warm, inviting scene highlighting natural textures and soft morning light."
        </p>
      </motion.div>
    </div>
  </div>
);

const Footer = () => (
  <footer className="w-full py-20 px-8 border-t border-orange-100/30 bg-white/50">
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-12 text-center md:text-left">
      <div className="space-y-4">
        <div className="text-2xl font-bold text-slate-900">AdGen AI</div>
        <p className="text-brand-apricot text-sm font-semibold tracking-wide">
          © 2024 ADGEN AI. CRAFTED WITH SOPHISTICATED HOSPITALITY.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-8 text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {['Privacy Policy', 'Terms of Service', 'Cookie Settings', 'Contact'].map(link => (
          <a key={link} href="#" className="hover:text-slate-900 transition-colors uppercase">{link}</a>
        ))}
      </div>
    </div>
  </footer>
);

export default function App() {
  const [activeMood, setActiveMood] = useState('luxury');
  const [customPrompt, setCustomPrompt] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setAssets([]);
      setGenerations([]);
      return;
    }

    const assetsQuery = query(
      collection(db, `users/${user.uid}/assets`),
      orderBy('createdAt', 'desc')
    );
    const generationsQuery = query(
      collection(db, `users/${user.uid}/generations`),
      orderBy('createdAt', 'desc')
    );

    const unsubAssets = onSnapshot(assetsQuery, (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/assets`));

    const unsubGens = onSnapshot(generationsQuery, (snapshot) => {
      setGenerations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Generation)));
    }, (error) => handleFirestoreError(error, OperationType.GET, `users/${user.uid}/generations`));

    return () => {
      unsubAssets();
      unsubGens();
    };
  }, [user]);

  const handleGenerate = async () => {
    if (!user || !activeMood || isGenerating) return;

    setIsGenerating(true);
    const genPath = `users/${user.uid}/generations`;
    
    let docId = '';
    try {
      // 1. Create a pending generation record
      const docRef = await addDoc(collection(db, genPath), {
        userId: user.uid,
        prompt: customPrompt || `A premium ${activeMood} brand advertisement.`,
        mood: activeMood,
        status: 'pending',
        imageUrl: '',
        createdAt: serverTimestamp(),
      });
      docId = docRef.id;

      // 2. Generate with Gemini
      const imageUrl = await generateAdImage(
        customPrompt || `A premium ${activeMood} brand advertisement.`,
        activeMood
      );

      // 3. Update record with result
      const targetPath = `${genPath}/${docId}`;
      try {
        await setDoc(doc(db, targetPath), {
          status: 'completed',
          imageUrl: imageUrl,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, targetPath);
      }

    } catch (error) {
      console.error("Generation failed:", error);
      if (docId) {
        const targetPath = `${genPath}/${docId}`;
        try {
          await setDoc(doc(db, targetPath), {
            status: 'failed',
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (e) {
          // Silent fail for the failure update
        }
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-brand-apricot/20">
      <Navbar user={user} />
      
      <main className="flex-grow pt-32 pb-xl px-8 w-full">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-20 text-center max-w-3xl mx-auto space-y-4">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-8xl font-extrabold tracking-tighter"
            >
              AdGen <span className="text-brand-apricot">Studio</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-slate-500 font-body leading-relaxed"
            >
              Transform your brand assets into sophisticated, studio-quality commercial identities using state-of-the-art vision models.
            </motion.p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-8 flex flex-col gap-10">
              <motion.section
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
              >
                <SourceAssets user={user} assets={assets} />
              </motion.section>

              <motion.section
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <AestheticMood 
                  activeMood={activeMood} 
                  onMoodSelect={setActiveMood} 
                  customPrompt={customPrompt}
                  onPromptChange={setCustomPrompt}
                />
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                <HistoryGrid generations={generations} />
              </motion.section>
            </div>

            <div className="lg:col-span-4 flex flex-col gap-10 sticky top-32">
              <motion.section
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <ModelStatus 
                  mood={activeMood} 
                  assetCount={assets.length} 
                  onGenerate={handleGenerate}
                  isGenerating={isGenerating}
                  user={user}
                />
              </motion.section>

              <motion.section
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <PreviewImage mood={activeMood} />
              </motion.section>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
