"use client";

import { useState } from "react";

export default function Compteur() {
  const [count, setValeur] = useState(0);

  console.log("Compteur rendu avec la valeur:", count);

  return (
    <button
        onClick={() => setValeur(count + 1)}
        className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
    >
      Compteur: {count}
    </button>
  );
}   