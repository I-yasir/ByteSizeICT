import { Link, Text } from '@react-email/components';
import { codeStyle, EmailLayout, mutedStyle, textStyle } from './layout';

export type CredentialsEmailProps = {
  brandName: string;
  siteUrl: string;
  mobile: string;
  pin: string;
  startsAt: string; // pre-formatted (Dhaka)
  expiresAt: string;
  reason: 'welcome' | 'reset';
};

/** Login details (PRD A-04/A-05). The PIN exists only in this rendered email, never in storage. */
export default function CredentialsEmail(props: CredentialsEmailProps) {
  const loginUrl = `${props.siteUrl}/login`;
  return (
    <EmailLayout
      preview={props.reason === 'welcome' ? `Welcome to ${props.brandName}` : `Your new ${props.brandName} PIN`}
      brandName={props.brandName}
      bn={
        <>
          <Text style={textStyle}>
            {props.reason === 'welcome' ? `${props.brandName}-এ স্বাগতম!` : 'আপনার নতুন পিন তৈরি করা হয়েছে।'}
          </Text>
          <Text style={mutedStyle}>লগইন আইডি (মোবাইল): {props.mobile}</Text>
          <Text style={mutedStyle}>পিন:</Text>
          <Text style={codeStyle}>{props.pin}</Text>
          <Text style={mutedStyle}>
            মেয়াদ: {props.startsAt} — {props.expiresAt}
          </Text>
          <Text style={textStyle}>
            কীভাবে শুরু করবেন: 1) <Link href={loginUrl}>{loginUrl}</Link> এ যান 2) মোবাইল নম্বর ও পিন দিয়ে লগইন করুন 3)
            নিজের নতুন পিন সেট করুন।
          </Text>
        </>
      }
      en={
        <>
          <Text style={textStyle}>
            {props.reason === 'welcome' ? `Welcome to ${props.brandName}!` : 'A new PIN has been created for you.'}
          </Text>
          <Text style={mutedStyle}>Login ID (mobile): {props.mobile}</Text>
          <Text style={mutedStyle}>PIN: {props.pin}</Text>
          <Text style={mutedStyle}>
            Access: {props.startsAt} — {props.expiresAt}
          </Text>
          <Text style={textStyle}>
            How to start: 1) Open <Link href={loginUrl}>{loginUrl}</Link> 2) Log in with your mobile number and PIN 3)
            Set your own new PIN.
          </Text>
        </>
      }
    />
  );
}
