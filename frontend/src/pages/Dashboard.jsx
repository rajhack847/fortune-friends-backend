import { useState, useEffect } from 'react';
import { fortuneDrawAPI, ticketAPI, referralAPI, userAPI } from '../services/api';
import './Dashboard.css';

function Dashboard({ user }) {
  const [lottery, setLottery] = useState(null);
  const [ticketStats, setTicketStats] = useState({});
  const [referralStats, setReferralStats] = useState({});
  const [winningChance, setWinningChance] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      console.log('Fetching lottery data...');
      const fortuneDrawRes = await fortuneDrawAPI.getActive();
      console.log('Lottery response:', fortuneDrawRes);
      const fortuneDrawData = fortuneDrawRes.data.data;
      console.log('Lottery data:', fortuneDrawData);
      
      // Handle array of lotteries - use first one (lowest price)
      const activeFortuneDrawEvent = Array.isArray(fortuneDrawData) ? fortuneDrawData[0] : fortuneDrawData;
      console.log('Active lottery:', activeFortuneDrawEvent);
      
      if (!activeFortuneDrawEvent) {
        console.error('No Active Fortune Draw found');
        setLottery(null);
        setTicketStats({});
        setReferralStats({});
        setWinningChance({});
        setLoading(false);
        return;
      }
      
      setLottery(activeFortuneDrawEvent);
      console.log('Fetching additional stats...');
      
      try {
        const [ticketsRes, referralsRes, chanceRes] = await Promise.all([
          ticketAPI.getStats(activeFortuneDrawEvent.id).catch(e => ({ data: { data: {} } })),
          referralAPI.getStats().catch(e => ({ data: { data: {} } })),
          fortuneDrawAPI.getMyChance(activeFortuneDrawEvent.id).catch(e => ({ data: { data: {} } }))
        ]);
        
        console.log('Stats fetched successfully');
        setTicketStats(ticketsRes.data.data || {});
        setReferralStats(referralsRes.data.data || {});
        setWinningChance(chanceRes.data.data || {});
      } catch (statsError) {
        console.error('Error fetching stats:', statsError);
        // Set default empty objects so the component doesn't crash
        setTicketStats({});
        setReferralStats({});
        setWinningChance({});
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      console.error('Error details:', error.response);
      // Don't crash the app, set safe defaults
      setLottery(null);
      setTicketStats({});
      setReferralStats({});
      setWinningChance({});
    } finally {
      setLoading(false);
    }
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(user.referralLink);
    alert('Referral link copied to clipboard!');
  };

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>;
  }

  if (!lottery) {
    return (
      <div className="dashboard">
        <div className="card text-center">
          <h2>No Active Fortune Draw</h2>
          <p>There is no active fortune draw event at the moment. Please check back later!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Welcome to Fortune Friends, {user.name}! 👋</h1>
        <p className="text-muted">User ID: {user.userId}</p>
      </div>
      
      <div className="grid grid-2">
        <div className="card stat-box">
          <h3>🎫 My Tickets</h3>
          <div className="stat-number">{ticketStats?.approved_tickets || 0}</div>
          <div className="stat-details">
            <span className="badge badge-success">{ticketStats?.approved_tickets || 0} Approved</span>
            <span className="badge badge-pending">{ticketStats?.pending_tickets || 0} Pending</span>
            {ticketStats?.rejected_tickets > 0 && (
              <span className="badge badge-danger">{ticketStats.rejected_tickets} Rejected</span>
            )}
          </div>
        </div>
        
        <div className="card stat-box">
          <h3>👥 My Referrals</h3>
          <div className="stat-number">{referralStats?.paid_referrals || 0}</div>
          <div className="stat-details">
            <span className="badge badge-success">{referralStats?.paid_referrals || 0} Paid</span>
            <span className="badge badge-pending">{referralStats?.pending_referrals || 0} Pending</span>
            <div className="text-muted" style={{ marginTop: '8px', fontSize: '14px' }}>
              +{referralStats?.total_bonus_entries || 0} Bonus Entries
            </div>
          </div>
        </div>
      </div>
      
      <div className="card winning-chance">
        <h2>🎯 Your Winning Chance</h2>
        <div className="chance-breakdown">
          <div className="chance-item">
            <span className="chance-label">Base Entries (Tickets):</span>
            <span className="chance-value">{winningChance?.baseEntries || 0}</span>
          </div>
          <div className="chance-item">
            <span className="chance-label">Bonus Entries (Referrals):</span>
            <span className="chance-value">+{winningChance?.bonusEntries || 0}</span>
          </div>
          <div className="chance-item total">
            <span className="chance-label">Total Entries:</span>
            <span className="chance-value">{winningChance?.totalEntries || 0}</span>
          </div>
          <div className="chance-percentage">
            <div className="percentage-label">Winning Probability</div>
            <div className="percentage-value">{winningChance?.winningChance || '0%'}</div>
          </div>
        </div>
        <p className="text-muted text-center" style={{ marginTop: '16px' }}>
          Out of {winningChance?.totalParticipants || 0} participants with {winningChance?.totalWeightPool || 0} total entries
        </p>
      </div>
      
      <div className="card referral-box">
        <h2>🔗 Share Your Referral Link</h2>
        <p className="text-muted">Get bonus entries for every friend who purchases a ticket!</p>
        
        {user.referralLink ? (
          <>
            <div className="referral-code-box">
              <div>
                <div className="referral-label">Your Referral Code</div>
                <div className="referral-code">{user.referralCode}</div>
              </div>
              <button onClick={copyReferralLink} className="btn btn-primary">
                Copy Link
              </button>
            </div>
            
            <div className="referral-link-display">
              {user.referralLink}
            </div>
          </>
        ) : (
          <div style={{ padding: '20px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', marginTop: '12px' }}>
            <p style={{ margin: 0, color: '#856404' }}>
              ⚠️ <strong>Please log out and sign in again</strong> to generate your referral link.
            </p>
          </div>
        )}
      </div>
      
      {lottery && (
        <div className="card countdown-box">
          <h2>⏰ Next Draw</h2>
          <div className="draw-date">{new Date(lottery.draw_date).toLocaleDateString('en-IN', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</div>
          <p className="text-muted">
            {lottery.prize_type === 'car' 
              ? `Win: ${lottery.prize_details}` 
              : `Prize Amount: ₹${lottery.prize_amount?.toLocaleString() || '0'}`
            }
          </p>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
