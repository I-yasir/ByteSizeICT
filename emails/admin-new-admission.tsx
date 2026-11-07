import { Link, Text } from '@react-email/components';
import { EmailLayout, mutedStyle, textStyle } from './layout';

export type AdminNewAdmissionEmailProps = {
  brandName: string;
  queueUrl: string;
  mobile: string;
  kind: 'new' | 'renewal';
  method: string;
  trxId: string;
  amountBdt: number | null;
};

export default function AdminNewAdmissionEmail(props: AdminNewAdmissionEmailProps) {
  const amount = props.amountBdt === null ? '—' : `৳${props.amountBdt.toLocaleString('en-US')}`;
  return (
    <EmailLayout
      preview={`New ${props.kind} request: ${props.mobile}`}
      brandName={props.brandName}
      bn={
        <>
          <Text style={textStyle}>নতুন {props.kind === 'new' ? 'ভর্তি' : 'রিনিউ'} অনুরোধ এসেছে।</Text>
          <Text style={mutedStyle}>
            মোবাইল: {props.mobile} · মাধ্যম: {props.method} · TrxID: {props.trxId} · পরিমাণ: {amount}
          </Text>
          <Text style={textStyle}>
            যাচাই করুন: <Link href={props.queueUrl}>{props.queueUrl}</Link>
          </Text>
        </>
      }
      en={
        <>
          <Text style={textStyle}>A new {props.kind} request has arrived.</Text>
          <Text style={mutedStyle}>
            Mobile: {props.mobile} · Method: {props.method} · TrxID: {props.trxId} · Amount: {amount}
          </Text>
          <Text style={textStyle}>
            Review it: <Link href={props.queueUrl}>{props.queueUrl}</Link>
          </Text>
        </>
      }
    />
  );
}
