import { Link, Text } from '@react-email/components';
import { EmailLayout, mutedStyle, textStyle } from './layout';

export type AdmissionRejectedEmailProps = {
  brandName: string;
  trxId: string;
  reason: string;
  whatsappUrl: string | null;
};

export default function AdmissionRejectedEmail(props: AdmissionRejectedEmailProps) {
  return (
    <EmailLayout
      preview={`About your ${props.brandName} enrollment request`}
      brandName={props.brandName}
      bn={
        <>
          <Text style={textStyle}>দুঃখিত, আপনার ভর্তির অনুরোধটি যাচাই করা যায়নি।</Text>
          <Text style={mutedStyle}>ট্রানজ্যাকশন আইডি: {props.trxId}</Text>
          <Text style={mutedStyle}>কারণ: {props.reason}</Text>
          {props.whatsappUrl ? (
            <Text style={textStyle}>
              প্রশ্ন থাকলে হোয়াটসঅ্যাপে যোগাযোগ করুন: <Link href={props.whatsappUrl}>{props.whatsappUrl}</Link>
            </Text>
          ) : null}
        </>
      }
      en={
        <>
          <Text style={textStyle}>Sorry, we couldn&apos;t verify your enrollment request.</Text>
          <Text style={mutedStyle}>Transaction ID: {props.trxId}</Text>
          <Text style={mutedStyle}>Reason: {props.reason}</Text>
          {props.whatsappUrl ? (
            <Text style={textStyle}>
              Questions? Contact us on WhatsApp: <Link href={props.whatsappUrl}>{props.whatsappUrl}</Link>
            </Text>
          ) : null}
        </>
      }
    />
  );
}
