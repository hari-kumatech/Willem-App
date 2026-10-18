import { Fragment } from 'react';

// Renders message text where **segments** are bold. No HTML injection: plain React text nodes.
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (i % 2 === 1 ? <b key={i}>{part}</b> : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}
