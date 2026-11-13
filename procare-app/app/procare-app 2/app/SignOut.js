export default function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="signout" type="submit">Sign out</button>
    </form>
  );
}
