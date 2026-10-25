'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3,BookOpen,FlaskConical,KeyRound,FileCheck2 } from 'lucide-react';
const links=[{href:'/',label:'Leaderboard',icon:BarChart3},{href:'/benchmarks',label:'Benchmarks',icon:BookOpen},{href:'/submit',label:'Submit a run',icon:FlaskConical},{href:'/keys',label:'API keys',icon:KeyRound},{href:'/about',label:'How Assay works',icon:FileCheck2}];
export function Navigation(){const path=usePathname();return <nav aria-label="Main navigation">{links.map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={path===href?'page':undefined} className={path===href?'nav-link active':'nav-link'}><Icon size={19}/><span>{label}</span></Link>)}</nav>;}
