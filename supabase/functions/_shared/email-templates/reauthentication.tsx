/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação do Duelverse ⚔️</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={logo}>⚔️ DUELVERSE</Text>
        <Heading style={h1}>Confirmar identidade</Heading>
        <Text style={text}>Use o código abaixo para confirmar sua identidade:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Este código expira em breve. Se você não solicitou, ignore este email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#1a1a2e', fontFamily: 'Arial, sans-serif' }
const container = { padding: '30px 25px', backgroundColor: '#1e1e3a', borderRadius: '12px', margin: '20px auto', maxWidth: '480px' }
const logo = { fontSize: '18px', fontWeight: 'bold' as const, color: '#a855f7', textAlign: 'center' as const, margin: '0 0 20px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#fef9c3', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#a3a3b5', lineHeight: '1.6', margin: '0 0 20px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#a855f7',
  margin: '0 0 30px',
  textAlign: 'center' as const,
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#666680', margin: '30px 0 0' }
