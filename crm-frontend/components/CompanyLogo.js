import Image from "next/image";
import logo from "../app/UpdatedLogo.jpeg";

export default function CompanyLogo({ className }) {
  return (
    <Image
      alt="Codex Solutions"
      className={`object-cover object-center ${className}`}
      priority
      src={logo}
    />
  );
}
