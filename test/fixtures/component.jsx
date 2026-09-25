import { useState } from "react";

export default function Counter({ items }) {
  const [count, setCount] = useState(0);
  const unused = 2;
  return (
    <ul onClick={() => setCount(count + 1)}>
      {items.map((item) => <li>{item}</li>)}
      <img src="/x.png" />
      {missingVar}
      {window.location.href}
    </ul>
  );
}
