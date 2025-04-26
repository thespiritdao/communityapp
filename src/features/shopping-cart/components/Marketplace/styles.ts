import styled from "styled-components";



export const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px;
  background-image: url('/images/chatbg.png'); /* Update path if needed */
  min-height: 100vh;
`;

export const TwoColumnGrid = styled.div`
  display: flex;
  gap: 20px;
`;

export const Side = styled.div`
  width: 25%;
`;

export const Main = styled.div`
  width: 75%;
`;


export const ErrorMessage = styled.p`
  color: red;
`;

export const TokenInfo = styled.p`
  font-weight: bold;
  color: green;
`;

// A header section for filters and sort options
export const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* Optional: add background or border to distinguish the header */
  background-color: ${({ theme }) => theme.colors.secondaryLight};
  padding: 10px;
  border-radius: 5px;
`;

// Main content area that holds messages and products
export const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

// A header for the main content (e.g., product count)
export const MainHeader = styled.div`
  font-size: 1.2rem;
  font-weight: bold;
  margin-bottom: 10px;
`;
