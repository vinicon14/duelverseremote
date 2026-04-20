/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Redefinir senha do Duelverse ⚔️</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={logo}>⚔️ DUELVERSE</Text>
        <Heading style={h1}>Redefinir sua senha</Heading>
        <Text style={text}>
          Recebemos um pedido para redefinir sua senha no Duelverse. Clique no botão abaixo para criar uma nova senha.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Redefinir Senha
        </Button>
        <Text style={footer}>
          Se você não solicitou isso, pode ignorar este email. Sua senha não será alterada.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#1a1a2e', fontFamily: 'Arial, sans-serif' }
const container = { padding: '30px 25px', backgroundColor: '#1e1e3a', borderRadius: '12px', margin: '20px auto', maxWidth: '480px' }
const logo = { fontSize: '18px', fontWeight: 'bold' as const, color: '#a855f7', textAlign: 'center' as const, margin: '0 0 20px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#fef9c3', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#a3a3b5', lineHeight: '1.6', margin: '0 0 20px' }
const button = {
  backgroundColor: '#a855f7',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '12px',
  padding: '14px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#666680', margin: '30px 0 0' }
