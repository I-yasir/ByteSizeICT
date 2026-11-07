import { Link, Text } from '@react-email/components';
import { EmailLayout, mutedStyle, textStyle } from './layout';

export type RenewalApprovedEmailProps = { brandName: string; siteUrl: string; mobile: string; expiresAt: string };

export default function RenewalApprovedEmail(props: RenewalApprovedEmailProps) {
  const loginUrl = `${props.siteUrl}/login`;
  return (
    <EmailLayout
      preview={`Your ${props.brandName} access was renewed`}
      brandName={props.brandName}
      bn={
        <>
          <Text style={textStyle}>আপনার রিনিউ সম্পন্ন হয়েছে। ধন্যবাদ!</Text>
          <Text style={mutedStyle}>মোবাইল: {props.mobile}</Text>
          <Text style={mutedStyle}>নতুন মেয়াদ শেষ: {props.expiresAt}</Text>
          <Text style={textStyle}>
            আগের পিন দিয়েই লগইন করুন: <Link href={loginUrl}>{loginUrl}</Link>
          </Text>
        </>
      }
      en={
        <>
          <Text style={textStyle}>Your renewal is complete. Thank you!</Text>
          <Text style={mutedStyle}>Mobile: {props.mobile}</Text>
          <Text style={mutedStyle}>New expiry: {props.expiresAt}</Text>
          <Text style={textStyle}>
            Log in with your existing PIN: <Link href={loginUrl}>{loginUrl}</Link>
          </Text>
        </>
      }
    />
  );
}
