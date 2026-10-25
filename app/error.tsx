'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <div className="page-body large-empty"><h1>A brief interruption.</h1><p>The service couldn’t load this page. Your saved evidence is still there.</p><button className="button primary" onClick={reset}>Try again</button></div>;}
