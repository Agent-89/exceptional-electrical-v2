'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquareQuote } from 'lucide-react';

type Review = { name: string; quote: string; source: string };
export function ReviewCarousel({ reviews }: { reviews: Review[] }) {
 const [index, setIndex] = useState(0);
 const [paused, setPaused] = useState(false);
 const startX = useRef<number | null>(null);
 const count = reviews.length;
 useEffect(() => {
  if (paused || count < 2) return;
  const timer = window.setInterval(() => setIndex(i => (i + 1) % count), 6500);
  return () => window.clearInterval(timer);
 }, [paused, count]);
 const next = () => setIndex(i => (i + 1) % count);
 const previous = () => setIndex(i => (i - 1 + count) % count);
 return <div className="review-carousel" aria-label="Customer reviews carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false); }}>
  <div className="review-carousel-window" onTouchStart={e => { startX.current = e.touches[0].clientX; setPaused(true); }} onTouchEnd={e => { if (startX.current !== null) { const dx = e.changedTouches[0].clientX - startX.current; if (Math.abs(dx) > 45) { if (dx < 0) next(); else previous(); } } startX.current = null; setPaused(false); }}>
   <div className="review-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
    {reviews.map((review, i) => <blockquote className="testimonial-card review-slide" key={review.name + i} aria-hidden={i !== index}><MessageSquareQuote size={25} strokeWidth={1.5}/><p>“{review.quote}”</p><footer><strong>{review.name}</strong><span>Via {review.source}</span></footer></blockquote>)}
   </div>
  </div>
  <div className="review-carousel-controls"><button type="button" aria-label="Previous review" onClick={previous}><ChevronLeft size={20}/></button><div className="review-carousel-dots" aria-label="Choose review">{reviews.map((review,i) => <button type="button" key={review.name+i} aria-label={`Show review ${i+1}`} aria-current={index===i?'true':undefined} className={index===i?'active':''} onClick={() => setIndex(i)}/>)}</div><button type="button" aria-label="Next review" onClick={next}><ChevronRight size={20}/></button></div>
 </div>;
}
