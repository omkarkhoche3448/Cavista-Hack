import Navbar from "@/components/navbar/Navbar";

export default function DefaultLayout({ children }) {
  return (
    <>
      <Navbar />
      <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
    </>
  );
}
