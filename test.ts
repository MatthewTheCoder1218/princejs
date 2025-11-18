import { prince } from './src/prince';
import { render, Html, Head, Title, Body, Div, H1, P, Button } from './src/jsx';

const app = prince();

// JSX Component
const Layout = ({ children, title }: any) => (
  <Html>
    <Head>
      <Title>{title}</Title>
    </Head>
    <Body>
      <Div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
        {children}
      </Div>
    </Body>
  </Html>
);

const HomePage = () => (
  <Layout title="PrinceJS + JSX">
    <H1>Hello from PrinceJS JSX!</H1>
    <P>This is server-side rendered with JSX</P>
    <Button onclick="alert('It works!')">Click me</Button>
  </Layout>
);

app.get('/jsx', () => render(<HomePage />));

// Regular API routes still work
app.get('/api/users', () => {
  return { users: [{ id: 1, name: 'Alice' }] };
});

app.listen(3000);