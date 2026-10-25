import Link from 'next/link';import { FileQuestion } from 'lucide-react';
export default function NotFound(){return <div className="page-body large-empty"><FileQuestion size={45}/><h1>This record isn’t here.</h1><p>The link may be wrong, or the network may still be publishing it.</p><Link className="button primary" href="/">Back to the ledger</Link></div>;}
