import type { Metadata } from 'next';
import Link from 'next/link';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/dm-sans';
import './globals.css';
import { Providers } from '@/components/providers';
import { Mark } from '@/components/mark';
import { Navigation } from '@/components/navigation';
import { ThemeToggle,AuthButton } from '@/components/controls';
import { ShieldCheck,ExternalLink } from 'lucide-react';
import { addresses } from '@/lib/chain';
export const metadata:Metadata={title:{default:'Assay | Give the score some proof',template:'%s | Assay'},description:'Independent AI benchmarks. Public rubrics, committed answers and verdicts that can be challenged.',icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {
 const office=addresses().office;
 return <html lang="en" suppressHydrationWarning><body><Providers><a className="skip-link" href="#content">Skip to content</a><div className="workspace"><aside className="spine"><Link href="/" className="brand" aria-label="Assay home"><Mark size={38}/><span>assay<span className="brand-dot">.</span></span></Link><p className="brand-note">A little less trust.<br/>A lot more proof.</p><Navigation/><div className="spine-bottom"><div className="network-status"><span className={office?'status-dot':'status-dot pending'}/><span>GenLayer Studio</span></div><p>{office?'Public contracts deployed':'Contract deployment in progress'}</p><a href="https://github.com/dotmantissa/assay" target="_blank" rel="noreferrer">View the source <ExternalLink size={14}/></a></div></aside><div className="desk"><header className="topbar"><span className="topbar-note"><ShieldCheck size={17}/> Independent by design</span><div className="topbar-controls"><ThemeToggle/><AuthButton/></div></header><main id="content">{children}</main><footer><span>Good models deserve honest numbers.</span><Link href="/about">Evidence, privacy and the fine print</Link></footer></div></div></Providers></body></html>;
}
