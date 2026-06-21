import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "3rem 1rem" }}>
      <SignUp />
    </div>
  );
}
