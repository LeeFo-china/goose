import { LibrarySkeleton } from '@/components/rendering-library/library-client';
export default function Loading() { return <div className="flex flex-col gap-4"><h1 className="text-xl font-semibold">装修效果库</h1><LibrarySkeleton /></div>; }
